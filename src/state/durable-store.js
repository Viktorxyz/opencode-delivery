/**
 * Crash-safe durable storage primitives.
 *
 * Three guarantees the durable store must hold for every Ship-owned
 * artifact under the resolved Git common directory:
 *
 *   1. A reader never sees a half-written JSON value. Writes go to a
 *      sibling temporary file, fsync the file, rename atomically, and
 *      fsync the parent directory so a crash after the rename still
 *      exposes the previous complete value.
 *
 *   2. Immutable records cannot be overwritten silently. The first
 *      writer to claim a path with `publishImmutableJson` wins; later
 *      writers fail without touching the file.
 *
 *   3. Mutating a shared snapshot from multiple processes cannot lose
 *      updates. The CAS helper bumps a generation counter and rejects
 *      reducers that run against a stale generation.
 *
 * Resource locks are exclusive directory locks that record PID,
 * hostname, resource key, and start timestamp. Stale locks (same host,
 * dead PID, older than 120 s) are quarantined to a `stale-<ts>` file
 * so the next caller can take the lock without a process restart.
 */

import {
  open as fsOpen,
  writeFile,
  readFile,
  rename,
  mkdir,
  readdir,
  unlink,
  stat,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { hostname as osHostname } from "node:os";

const STALE_LOCK_MS = 120 * 1000;

function randomToken() {
  return randomBytes(8).toString("hex");
}

function ensureString(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

async function fsyncDir(path) {
  try {
    const handle = await fsOpen(path, "r");
    try { await handle.sync(); } finally { await handle.close(); }
  } catch { /* ignore non-fsyncable parents */ }
}

/**
 * Atomically replace the contents of `path` with `value` rendered as
 * JSON. The write is sibling-temp + fsync + rename + parent fsync.
 *
 * @param {string} path Absolute target path.
 * @param {unknown} value Any JSON-serialisable value.
 */
export async function atomicReplaceJson(path, value) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("atomicReplaceJson: path must be a non-empty string");
  }
  const target = resolve(path);
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const tmp = `${target}.${randomToken()}.tmp`;
  const handle = await fsOpen(tmp, "w", 0o600);
  try {
    await handle.writeFile(ensureString(value), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(tmp, target);
  await fsyncDir(parent);
}

/**
 * Publish an immutable JSON record at `path`. Fails if the final path
 * already exists, so the first writer wins and later writers see a
 * stable error. Use this for plan bytes, approval seals, mirror
 * chunks, and other append-only history.
 *
 * Atomicity is provided by `open(path, 'wx')` (exclusive create). A
 * second concurrent publisher races on the kernel-level O_EXCL flag;
 * the loser sees an EEXIST and is rejected. Once the final file is
 * created it is fsynced, the parent directory is fsynced, and the
 * result cannot be silently overwritten by another publisher.
 *
 * @param {string} path
 * @param {unknown} value
 */
export async function publishImmutableJson(path, value) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("publishImmutableJson: path must be a non-empty string");
  }
  const target = resolve(path);
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  let handle;
  try {
    handle = await fsOpen(target, "wx", 0o600);
  } catch (err) {
    if (err && (err.code === "EEXIST" || err.code === "EACCES")) {
      throw new Error(`publishImmutableJson: target already exists: ${target}`);
    }
    throw err;
  }
  try {
    await handle.writeFile(ensureString(value), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fsyncDir(parent);
}

/**
 * Acquire an exclusive resource lock under `<stateDir>/locks/<hash>/`,
 * run the callback, and release the lock. The lock is a directory
 * containing a single `owner.json` with PID, hostname, resource key,
 * and start timestamp.
 *
 * Concurrent callers for the same resource key are serialised: the
 * second caller polls for the lock to be released and queues up. A
 * non-blocking `options.acquire` variant is provided for tests and
 * code paths that need to detect contention explicitly.
 *
 * Stale-lock handling: if the lock is older than 120 s and owned by a
 * dead PID on the same host, the existing lock is renamed to
 * `stale-<timestamp>` so the next caller can claim it. Foreign-host
 * locks are never quarantined automatically.
 *
 * @template T
 * @param {string} stateDir Absolute opencode-ship state directory.
 * @param {string} resourceKey Stable resource identifier (workflow id,
 *   plan id, etc).
 * @param {(() => Promise<T>) | { callback: () => Promise<T>, options?: { acquire?: "wait" | "try", waitMs?: number, pollMs?: number } }} input
 * @returns {Promise<T>}
 */
export async function withResourceLock(stateDir, resourceKey, input) {
  if (typeof stateDir !== "string" || stateDir.length === 0) {
    throw new Error("withResourceLock: stateDir must be a non-empty string");
  }
  if (typeof resourceKey !== "string" || resourceKey.length === 0) {
    throw new Error("withResourceLock: resourceKey must be a non-empty string");
  }
  const callback = typeof input === "function" ? input : input?.callback;
  const options = typeof input === "function" ? {} : (input?.options ?? {});
  if (typeof callback !== "function") {
    throw new Error("withResourceLock: callback must be a function");
  }
  const acquireMode = options.acquire ?? "wait";
  const waitMs = Number.isInteger(options.waitMs) && options.waitMs >= 0 ? options.waitMs : 30 * 1000;
  const pollMs = Number.isInteger(options.pollMs) && options.pollMs > 0 ? options.pollMs : 25;
  const keyHash = createHash("sha256").update(resourceKey).digest("hex");
  const lockDir = join(stateDir, "locks", keyHash);
  const ownerPath = join(lockDir, "owner.json");

  await mkdir(stateDir, { recursive: true });
  const deadline = Date.now() + waitMs;
  let acquired = false;
  let quarantinedThisAcquire = false;
  while (!acquired) {
    try {
      await mkdir(lockDir, { recursive: true });
      const handle = await fsOpen(ownerPath, "wx", 0o600);
      try {
        const owner = {
          pid: process.pid,
          hostname: osHostname(),
          resource: resourceKey,
          startedAt: new Date().toISOString(),
        };
        await handle.writeFile(JSON.stringify(owner, null, 2) + "\n", "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      acquired = true;
    } catch (err) {
      if (err && err.code === "EEXIST") {
        const claimed = await maybeQuarantineStaleLock(lockDir, ownerPath, resourceKey);
        if (claimed) {
          quarantinedThisAcquire = true;
          continue;
        }
        if (acquireMode === "try") {
          throw new Error(`withResourceLock: resource is busy: ${resourceKey}`);
        }
        if (Date.now() >= deadline) {
          throw new Error(`withResourceLock: timed out waiting for ${resourceKey}`);
        }
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }
      throw err;
    }
  }
  try {
    return await callback();
  } finally {
    if (quarantinedThisAcquire) {
      await readdir(lockDir).then(async (entries) => {
        for (const e of entries) await unlink(join(lockDir, e)).catch(() => null);
      }).catch(() => null);
      await unlink(lockDir).catch(() => null);
    } else {
      await unlink(ownerPath).catch(() => null);
      await unlink(lockDir).catch(() => null);
    }
  }
}

async function maybeQuarantineStaleLock(lockDir, ownerPath, resourceKey) {
  let raw;
  try { raw = await readFile(ownerPath, "utf8"); } catch { return false; }
  let owner;
  try { owner = JSON.parse(raw); } catch { return false; }
  if (!owner || typeof owner !== "object") return false;
  if (!Number.isInteger(owner.pid) || owner.pid <= 0) return false;
  if (typeof owner.startedAt !== "string") return false;
  const start = Date.parse(owner.startedAt);
  if (!Number.isFinite(start)) return false;
  if (Date.now() - start < STALE_LOCK_MS) return false;
  if (owner.hostname !== osHostname()) return false;
  let alive = true;
  try { process.kill(owner.pid, 0); }
  catch (e) { alive = e?.code === "EPERM"; }
  if (alive) return false;
  const stamp = new Date(start).toISOString().replace(/[:.]/g, "-");
  const quarantinePath = join(lockDir, `stale-${stamp}-${resourceKey.replace(/[^A-Za-z0-9._-]+/g, "_")}.owner.json`);
  try {
    await rename(ownerPath, quarantinePath);
  } catch {
    return false;
  }
  return "quarantined";
}

/**
 * Compare-and-swap update of a JSON snapshot. The current snapshot
 * is read; if its `generation` does not equal `expectedGeneration`,
 * the reducer is rejected without writing. On success the new value
 * is written atomically with `generation: expectedGeneration + 1`.
 *
 * Parallel callers for the same `path` are serialised through a
 * per-path resource lock so two writers cannot both read the same
 * generation, both compute a new value, and both overwrite each
 * other. The lock is owned by `withResourceLock` and released even
 * when the reducer throws.
 *
 * @template T
 * @param {string} path Absolute snapshot path.
 * @param {number} expectedGeneration
 * @param {(current: T) => T} reducer
 * @param {{ stateDir?: string, waitMs?: number }} [options]
 *   `stateDir` defaults to the parent directory of `path`; pass an
 *   explicit value to use a shared state root across snapshots.
 * @returns {Promise<{ value: T; generation: number }>}
 */
export async function updateSnapshotCas(path, expectedGeneration, reducer, options = {}) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("updateSnapshotCas: path must be a non-empty string");
  }
  if (!Number.isInteger(expectedGeneration) || expectedGeneration < 0) {
    throw new Error("updateSnapshotCas: expectedGeneration must be a non-negative integer");
  }
  if (typeof reducer !== "function") {
    throw new Error("updateSnapshotCas: reducer must be a function");
  }
  const target = resolve(path);
  const stateDir = typeof options.stateDir === "string" && options.stateDir.length > 0
    ? options.stateDir
    : dirname(target);
  const lockKey = `cas:${target}`;
  return withResourceLock(stateDir, lockKey, {
    callback: async () => {
      const parent = dirname(target);
      await mkdir(parent, { recursive: true });

      let current = null;
      let currentGeneration = 0;
      if (existsSync(target)) {
        try {
          const raw = await readFile(target, "utf8");
          const parsed = JSON.parse(raw);
          current = parsed?.value;
          currentGeneration = Number.isInteger(parsed?.generation) ? parsed.generation : 0;
        } catch (err) {
          throw new Error(`updateSnapshotCas: cannot read existing snapshot: ${err?.message ?? err}`);
        }
      }
      if (currentGeneration !== expectedGeneration) {
        throw new Error(
          `updateSnapshotCas: stale generation (expected ${expectedGeneration}, found ${currentGeneration})`,
        );
      }
      const nextValue = reducer(current);
      const next = { generation: expectedGeneration + 1, value: nextValue };
      const tmp = `${target}.${randomToken()}.tmp`;
      const handle = await fsOpen(tmp, "w", 0o600);
      try {
        await handle.writeFile(JSON.stringify(next, null, 2) + "\n", "utf8");
        await handle.sync();
      } finally {
        await handle.close();
      }
      await rename(tmp, target);
      await fsyncDir(parent);
      if (existsSync(tmp)) {
        await unlink(tmp).catch(() => null);
      }
      return next;
    },
    options: { waitMs: options.waitMs },
  });
}
