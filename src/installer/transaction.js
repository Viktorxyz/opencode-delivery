/*
 * Multi-file transaction executor.
 *
 * Best-effort atomic updates with recoverable journal. Each operation:
 *   1. acquires an exclusive lock file under `.git/opencode-ship/.txn.lock`;
 *   2. snapshots original bytes and mode into the journal entry;
 *   3. writes to a sibling temporary file, `fsync`s, then renames;
 *   4. updates the journal after each operation so a recovery can
 *      recreate the pre-image;
 *   5. fsyncs the parent directory.
 *
 * The lock file is committed last (not part of the journal) by
 * `writeLock`. The journal itself is the recovery artifact; it is
 * unlinked when the transaction commits successfully.
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
  return resolve(gitDir(repoRoot) ?? repoRoot, "opencode-ship");
}

function transactionLockPath(repoRoot) {
  return resolve(lockDir(repoRoot), ".txn.lock");
}

function journalPath(repoRoot, txnId) {
  return resolve(lockDir(repoRoot), `.txn-${txnId}.journal`);
}

async function acquireLock(repoRoot, txnId) {
  const dir = lockDir(repoRoot);
  await mkdir(dir, { recursive: true });
  await writeFile(
    transactionLockPath(repoRoot),
    JSON.stringify({ pid: process.pid, txnId, startedAt: new Date().toISOString() }),
    { flag: "wx" },
  );
}

async function releaseLock(repoRoot) {
  try { await unlink(transactionLockPath(repoRoot)); } catch { /* ignore */ }
}

async function fsyncDir(path) {
  try {
    const handle = await open(path, "r");
    await handle.sync();
    await handle.close();
  } catch { /* ignore */ }
}

function randomToken() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

async function captureOriginal(target) {
  if (!existsSync(target)) return null;
  try {
    const bytes = await readFile(target);
    const fileStat = await stat(target);
    return { bytes, mode: fileStat.mode & 0o777 };
  } catch {
    return null;
  }
}

function asMode(mode) {
  return typeof mode === "number" ? mode : 0o644;
}

async function writeJournal(repoRoot, txnId, journal) {
  await writeFile(journalPath(repoRoot, txnId), JSON.stringify(journal, null, 2), "utf8");
}

async function clearJournal(repoRoot, txnId) {
  if (!txnId) return;
  try { await unlink(journalPath(repoRoot, txnId)); } catch { /* ignore */ }
}

async function recover(repoRoot) {
  const dir = lockDir(repoRoot);
  if (!existsSync(dir)) return { recovered: false };
  const { readdir } = await import("node:fs/promises");
  const names = await readdir(dir).catch(() => []);
  const journals = names.filter((n) => n.startsWith(".txn-") && n.endsWith(".journal"));
  if (!journals.length) return { recovered: false };
  let totalRecovered = 0;
  for (const name of journals) {
    let payload;
    try {
      const raw = await readFile(resolve(dir, name), "utf8");
      payload = JSON.parse(raw);
    } catch {
      await unlink(resolve(dir, name)).catch(() => null);
      continue;
    }
    const journal = payload;
    for (const entry of [...(journal.entries ?? [])].reverse()) {
      if (entry.op !== "promote") continue;
      if (entry.original) {
        try {
          await writeFile(entry.target, entry.original.bytes, { mode: entry.original.mode ?? 0o644 });
        } catch { /* ignore */ }
      } else if (entry.staged) {
        try {
          await rename(entry.staged, entry.target);
        } catch {
          try { await unlink(entry.staged); } catch { /* ignore */ }
        }
      }
    }
    await unlink(resolve(dir, name)).catch(() => null);
    totalRecovered += 1;
  }
  await releaseLock(repoRoot);
  return { recovered: totalRecovered > 0, recoveredCount: totalRecovered };
}

export async function executePlan({ repoRoot, plan, newLockBuilder }) {
  const recovered = await recover(repoRoot);
  const txnId = `txn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    await acquireLock(repoRoot, txnId);
  } catch (e) {
    return { ok: false, error: { kind: "lock-held", message: e?.message ?? String(e) } };
  }

  const journal = { repoRoot, txnId, startedAt: new Date().toISOString(), entries: [] };
  await writeJournal(repoRoot, txnId, journal);

  try {
    for (const op of plan) {
      if (op.op !== "file") continue;
      if (op.kind === "conflict" || op.kind === "noop" || op.kind === "converge") continue;

      const original = await captureOriginal(op.target);

      if (op.kind === "delete") {
        if (!existsSync(op.target)) continue;
        const backup = `${op.target}.txn-${randomToken()}-backup`;
        await rename(op.target, backup);
        journal.entries.push({
          op: "promote",
          target: op.target,
          staged: backup,
          original,
          kind: "delete",
        });
      } else {
        const tempPath = `${op.target}.txn-${randomToken()}`;
        await mkdir(dirname(op.target), { recursive: true });
        await writeFile(tempPath, op.bytes ?? Buffer.alloc(0), { mode: asMode(op.mode) });
        const h = await open(tempPath, "r+");
        await h.sync();
        await h.close();
        await rename(tempPath, op.target);
        journal.entries.push({
          op: "promote",
          target: op.target,
          staged: tempPath,
          original,
          kind: op.kind,
        });
      }
      await fsyncDir(dirname(op.target));
      await writeJournal(repoRoot, txnId, journal);
    }

    if (newLockBuilder) {
      const lockValue = await newLockBuilder();
      const { writeLock: writer } = await import("./lock.js");
      const lockPathTarget = `${repoRoot}/.opencode/ship.lock.json`;
      journal.entries.push({
        op: "promote",
        target: lockPathTarget,
        staged: lockPathTarget,
        original: await captureOriginal(lockPathTarget),
        kind: "lock",
      });
      await writer(repoRoot, lockValue);
      await writeJournal(repoRoot, txnId, journal);
    }

    await clearJournal(repoRoot, txnId);
    return { ok: true, txnId, recovered: recovered.recovered ?? false, recoveredCount: recovered.recoveredCount ?? 0 };
  } catch (e) {
    await rollback(repoRoot, journal);
    return { ok: false, error: { kind: "transaction-failed", message: e?.message ?? String(e) } };
  } finally {
    await releaseLock(repoRoot);
  }
}

async function rollback(repoRoot, journal) {
  for (const entry of [...(journal.entries ?? [])].reverse()) {
    if (entry.op !== "promote") continue;
    if (entry.original) {
      try {
        await writeFile(entry.target, entry.original.bytes, { mode: entry.original.mode ?? 0o644 });
      } catch { /* ignore */ }
    } else if (entry.staged) {
      try {
        await rename(entry.staged, entry.target);
      } catch {
        try { await unlink(entry.staged); } catch { /* ignore */ }
      }
    } else {
      try { await unlink(entry.target); } catch { /* ignore */ }
    }
    if (entry.staged && entry.staged !== entry.target && existsSync(entry.staged)) {
      try { await unlink(entry.staged); } catch { /* ignore */ }
    }
  }
  if (journal.txnId) await clearJournal(repoRoot, journal.txnId);
}
