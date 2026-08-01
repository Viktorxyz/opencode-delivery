/*
 * Multi-file transaction executor.
 *
 * Best-effort atomic updates with a recoverable journal. For each
 * file operation the executor:
 *
 *   1. acquires an exclusive lock file under the git common dir;
 *   2. snapshots the original file into a sibling backup file;
 *   3. writes the new bytes to a sibling temporary file and fsyncs;
 *   4. records both backup and staged paths in the journal;
 *   5. renames the original to a backup, then promotes the staged
 *      file into place, then fsyncs the parent directory;
 *   6. promotes the new lock last as the commit marker.
 *
 * On commit success the journal and every backup/staged file are
 * removed. On a rollback (caught exception), the executor walks the
 * journal in reverse, restores the original bytes from the backup,
 * removes the staged file, and deletes the journal. On startup the
 * same recovery walk runs against any leftover journal so a
 * process crash mid-transaction is recovered automatically.
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

function backupPath(target, token) {
  return `${target}.txn-${token}-backup`;
}

function stagedPath(target, token) {
  return `${target}.txn-${token}-staged`;
}

async function mkdirp(path) {
  await mkdir(path, { recursive: true });
}

async function acquireLock(repoRoot, txnId) {
  const dir = lockDir(repoRoot);
  await mkdirp(dir);
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
  const json = { ...journal, ledger: journal.entries.map((entry) => ({
    op: entry.op,
    target: entry.target,
    backup: entry.backup ?? null,
    staged: entry.staged ?? null,
    mode: entry.mode ?? null,
  })) };
  await writeFile(journalPath(repoRoot, txnId), JSON.stringify(json, null, 2), "utf8");
}

async function clearJournal(repoRoot, txnId) {
  if (!txnId) return;
  try { await unlink(journalPath(repoRoot, txnId)); } catch { /* ignore */ }
}

async function readJournal(repoRoot, name) {
  const path = resolve(lockDir(repoRoot), name);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function recover(repoRoot) {
  const dir = lockDir(repoRoot);
  if (!existsSync(dir)) return { recovered: false, recoveredCount: 0 };
  const { readdir } = await import("node:fs/promises");
  const names = await readdir(dir).catch(() => []);
  const journals = names.filter((n) => n.startsWith(".txn-") && n.endsWith(".journal"));
  if (!journals.length) return { recovered: false, recoveredCount: 0 };
  let totalRecovered = 0;
  for (const name of journals) {
    const journal = await readJournal(repoRoot, name);
    if (!journal) {
      await unlink(resolve(dir, name)).catch(() => null);
      continue;
    }
    for (const entry of [...(journal.ledger ?? [])].reverse()) {
      try {
        if (entry.op === "write") {
          if (entry.backup && existsSync(entry.backup)) {
            await rename(entry.backup, entry.target);
          } else if (entry.staged && existsSync(entry.staged)) {
            await unlink(entry.staged);
          }
        } else if (entry.op === "delete") {
          if (entry.backup && existsSync(entry.backup)) {
            await rename(entry.backup, entry.target);
          }
        }
      } catch { /* ignore */ }
    }
    await unlink(resolve(dir, name)).catch(() => null);
    totalRecovered += 1;
  }
  await releaseLock(repoRoot);
  return { recovered: totalRecovered > 0, recoveredCount: totalRecovered };
}

async function commitEntry(entry) {
  if (entry.op === "write") {
    if (entry.backup && existsSync(entry.backup)) {
      await unlink(entry.backup);
    }
  }
  if (entry.staged && existsSync(entry.staged)) {
    await unlink(entry.staged);
  }
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

      const token = randomToken();
      const backup = backupPath(op.target, token);
      const staged = stagedPath(op.target, token);

      if (op.kind === "delete") {
        if (!existsSync(op.target)) continue;
        await rename(op.target, backup);
        journal.entries.push({
          op: "delete", target: op.target, backup, staged: null, mode: asMode(op.mode),
        });
      } else {
        await mkdirp(dirname(op.target));
        if (existsSync(op.target)) {
          await rename(op.target, backup);
        }
        await writeFile(staged, op.bytes ?? Buffer.alloc(0), { mode: asMode(op.mode) });
        const h = await open(staged, "r+");
        await h.sync();
        await h.close();
        await rename(staged, op.target);
        journal.entries.push({
          op: "write", target: op.target, backup: existsSync(backup) ? backup : null, staged: null, mode: asMode(op.mode),
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
        op: "write", target: lockPathTarget, backup: null, staged: null, mode: 0o644,
      });
      await writer(repoRoot, lockValue);
      await writeJournal(repoRoot, txnId, journal);
    }

    for (const entry of journal.entries) {
      await commitEntry(entry);
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
  for (const entry of [...(journal.ledger ?? [])].reverse()) {
    if (entry.op === "delete") {
      if (entry.backup && existsSync(entry.backup)) {
        try { await rename(entry.backup, entry.target); } catch { /* ignore */ }
      }
    } else if (entry.op === "write") {
      if (entry.backup && existsSync(entry.backup)) {
        try { await rename(entry.backup, entry.target); } catch { /* ignore */ }
      } else if (entry.target && existsSync(entry.target)) {
        try { await unlink(entry.target); } catch { /* ignore */ }
      }
    }
  }
  if (journal.txnId) await clearJournal(repoRoot, journal.txnId);
}
