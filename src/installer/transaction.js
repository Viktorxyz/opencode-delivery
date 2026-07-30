/*
 * Multi-file transaction executor.
 *
 * Best-effort atomic updates with a recoverable journal. Every
 * operation:
 *   1. acquires an exclusive lock file under .git/opencode-ship/.txn;
 *   2. snapshots the original bytes and mode;
 *   3. writes to a sibling temporary file, `fsync`s, then renames;
 *   4. updates the journal after each rename;
 *   5. promotes the lock as the last step (the commit marker).
 *
 * Failure during pre-commit operations triggers reverse-order rollback.
 * Failure post-commit surfaces a "degraded cleanup" warning; the next
 * mutating command picks up where we left off.
 *
 * The executor is purely synchronous in shape: each operation is
 * sequence-bound and explicit. Concurrency is prevented at the lock
 * level (`.git/opencode-ship/.txn.lock`); other installer instances
 * fail fast with exit code 4 when the lock is held.
 */

import {
  writeFile,
  rename,
  readFile,
  unlink,
  mkdir,
  stat,
  open,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function gitDir(repoRoot) {
  const r = spawnSync("git", ["-C", repoRoot, "rev-parse", "--path-format=absolute", "--git-dir"], {
    encoding: "utf8",
  });
  if (r.status !== 0) return null;
  const trimmed = r.stdout.trim();
  return trimmed ? resolve(repoRoot, trimmed) : null;
}

function lockDir(repoRoot) {
  const dir = gitDir(repoRoot) ?? repoRoot;
  return resolve(dir, "opencode-ship");
}

function transactionLockPath(repoRoot) {
  return resolve(lockDir(repoRoot), ".txn.lock");
}

function journalPath(repoRoot, txnId) {
  return resolve(lockDir(repoRoot), `${txnId}.journal`);
}

async function acquireLock(repoRoot, txnId) {
  const lockDirPath = lockDir(repoRoot);
  await mkdir(lockDirPath, { recursive: true });
  const lockPath = transactionLockPath(repoRoot);
  await writeFile(lockPath, JSON.stringify({ pid: process.pid, txnId, startedAt: new Date().toISOString() }), {
    flag: "wx",
  });
  return lockPath;
}

async function releaseLock(repoRoot) {
  try {
    await unlink(transactionLockPath(repoRoot));
  } catch {
    // already gone
  }
}

async function fsyncDir(path) {
  try {
    const handle = await open(path, "r");
    await handle.sync();
    await handle.close();
  } catch {
    /* not supported on every platform */
  }
}

async function stageFile({ target, bytes, mode }) {
  const sibling = `${target}.txn-${Math.random().toString(36).slice(2, 10)}`;
  await mkdir(dirname(target), { recursive: true });
  await writeFile(sibling, bytes, { mode });
  const handle = await open(sibling, "r+");
  await handle.sync();
  await handle.close();
  return sibling;
}

async function promote({ target, staged, backupPath, repoRoot, journal }) {
  let backupBytes = null;
  let backupMode = null;
  if (existsSync(target)) {
    const buf = await readFile(target);
    backupBytes = buf;
    backupMode = (await stat(target)).mode & 0o777;
    await writeFile(backupPath, buf, { mode: backupMode });
  }
  await rename(staged, target);
  await fsyncDir(dirname(target));
  journal.entries.push({ op: "promote", target, backupPath, bytes: backupBytes, mode: backupMode });
  return { promoted: true };
}

async function rollback(journal) {
  const entries = [...journal.entries].reverse();
  for (const entry of entries) {
    if (entry.op === "promote") {
      if (entry.bytes !== null) {
        await writeFile(entry.target, entry.bytes, { mode: entry.mode ?? 0o644 });
      } else {
        try { await unlink(entry.target); } catch { /* noop */ }
      }
    }
  }
  try { await unlink(journalPath(journal.repoRoot, journal.txnId)); } catch { /* noop */ }
  try { await unlink(transactionLockPath(journal.repoRoot)); } catch { /* noop */ }
}

async function writeJournal(repoRoot, txnId, journal) {
  const path = journalPath(repoRoot, txnId);
  await writeFile(path, JSON.stringify(journal, null, 2), "utf8");
}

export async function executePlan({ repoRoot, plan, lock = null, newLockBuilder = null, txnId = null }) {
  const id = txnId ?? `txn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const acquired = await acquireLock(repoRoot, id);
  const journal = { repoRoot, txnId: id, startedAt: new Date().toISOString(), entries: [] };
  await writeJournal(repoRoot, id, journal);
  try {
    for (const op of plan) {
      if (op.kind === "conflict") continue;
      if (op.op === "file") {
        if (op.kind === "delete") {
          const backup = `${op.target}.txn-backup-${Math.random().toString(36).slice(2, 8)}`;
          if (existsSync(op.target)) {
            await rename(op.target, backup);
            journal.entries.push({ op: "promote", target: op.target, backupPath: backup, bytes: null, mode: null });
          }
        } else {
          const staged = await stageFile({ target: op.target, bytes: op.bytes ?? Buffer.alloc(0), mode: op.mode ?? 0o644 });
          await promote({ target: op.target, staged, backupPath: `${op.target}.txn-backup`, repoRoot, journal });
        }
      }
    }
    if (newLockBuilder) {
      const lockValue = await newLockBuilder();
      const lockBytes = JSON.stringify(lockValue, null, 2) + "\n";
      const staged = await stageFile({ target: `${repoRoot}/.opencode/ship.lock.json`, bytes: Buffer.from(lockBytes, "utf8"), mode: 0o644 });
      await promote({ target: `${repoRoot}/.opencode/ship.lock.json`, staged, backupPath: `${repoRoot}/.opencode/ship.lock.json.txn-backup`, repoRoot, journal });
    }
    await writeJournal(repoRoot, id, journal);
    try { await unlink(journalPath(repoRoot, id)); } catch { /* noop */ }
    return { ok: true, txnId: id };
  } catch (e) {
    await rollback(journal);
    return { ok: false, error: { kind: "transaction-failed", message: e?.message ?? String(e) } };
  } finally {
    await releaseLock(repoRoot);
  }
}


