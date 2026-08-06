/*
 * Multi-file transaction executor.
 *
 * Best-effort atomic updates with a recoverable journal. For each
 * file operation the executor:
 *
 *   1. acquires an exclusive lock file under the git common dir;
 *   2. records the intended backup/staged paths in a durable journal;
 *   3. writes the new bytes to a sibling temporary file and fsyncs;
 *   4. renames the original to a backup, then promotes the staged
 *      file into place, then fsyncs the parent directory;
 *   5. promotes the new lock last as the commit marker, then marks
 *      the journal committed for idempotent artifact cleanup.
 *
 * On commit success the journal and every backup/staged file are
 * removed. On a rollback (caught exception), the executor walks the
 * journal in reverse, restores the original bytes from the backup,
 * removes the staged file, and deletes the journal. On startup the
 * same recovery walk runs against any leftover journal so a
 * process crash mid-transaction is recovered automatically.
 *
 * State location: the transaction lock, journals, and lock file all
 * live under `<git-common-dir>/opencode-ship/` so main checkouts
 * and linked worktrees share the same state root. The old per-
 * worktree `--git-dir` state has been removed.
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
import { dirname, resolve, join } from "node:path";

import { computeIntegrity } from "./lock.js";
import { bytesHashString } from "./hash.js";
import { resolveGitCommonDir, opencodeShipStateDir } from "../state/git-common-dir.js";
import { withResourceLock, atomicReplaceJson } from "../state/durable-store.js";

function lockDirFromCommonDir(commonDir) {
  return opencodeShipStateDir(commonDir);
}

async function lockDirForRepo(repoRoot) {
  const commonDir = await resolveGitCommonDir(repoRoot);
  return lockDirFromCommonDir(commonDir);
}

function transactionLockPath(lockDir) {
  return resolve(lockDir, ".txn.lock");
}

function journalPath(lockDir, txnId) {
  return resolve(lockDir, `.txn-${txnId}.journal`);
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

async function acquireLock(lockDir, txnId) {
  await mkdirp(lockDir);
  const path = transactionLockPath(lockDir);
  const handle = await open(path, "wx", 0o600);
  try {
    await handle.writeFile(JSON.stringify({
      pid: process.pid,
      txnId,
      startedAt: new Date().toISOString(),
    }));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fsyncDir(lockDir);
}

async function releaseLock(lockDir) {
  try { await unlink(transactionLockPath(lockDir)); } catch { /* ignore */ }
}

async function liveLockOwner(lockDir) {
  const path = transactionLockPath(lockDir);
  if (!existsSync(path)) return false;
  try {
    const lock = JSON.parse(await readFile(path, "utf8"));
    if (!Number.isInteger(lock?.pid) || lock.pid <= 0) return false;
    process.kill(lock.pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
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

async function writeJournal(lockDir, txnId, journal) {
  const { entries, ...header } = journal;
  const json = { ...header, ledger: entries.map((entry) => ({
    op: entry.op,
    target: entry.target,
    backup: entry.backup ?? null,
    staged: entry.staged ?? null,
    hadOriginal: entry.hadOriginal ?? null,
    commitMarker: entry.commitMarker ?? false,
    installedSha256: entry.installedSha256 ?? null,
    mode: entry.mode ?? null,
  })) };
  await atomicReplaceJson(journalPath(lockDir, txnId), json);
}

async function clearJournal(lockDir, txnId) {
  if (!txnId) return;
  try { await unlink(journalPath(lockDir, txnId)); } catch { /* ignore */ }
}

async function readJournal(lockDir, name) {
  const path = resolve(lockDir, name);
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    throw new Error(`transaction journal unreadable: ${path}: ${err?.message ?? err}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`transaction journal malformed JSON: ${path}: ${err?.message ?? err}`);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.ledger)) {
    throw new Error(`transaction journal missing ledger: ${path}`);
  }
  return parsed;
}

async function isCommitted(journal) {
  if (journal.committed) return true;
  const marker = journal.ledger?.find((entry) => entry.commitMarker);
  if (!marker?.target || !marker.installedSha256 || !existsSync(marker.target)) return false;
  try {
    return bytesHashString(await readFile(marker.target, "utf8")) === marker.installedSha256;
  } catch {
    return false;
  }
}

async function restoreEntry(entry) {
  if (entry.op === "write") {
    if (entry.backup && existsSync(entry.backup)) {
      await rename(entry.backup, entry.target);
    } else if (entry.hadOriginal === false && existsSync(entry.target)) {
      await unlink(entry.target);
    }
    if (entry.staged && existsSync(entry.staged)) await unlink(entry.staged);
  } else if (entry.op === "delete" && entry.backup && existsSync(entry.backup)) {
    await rename(entry.backup, entry.target);
  }
  await fsyncDir(dirname(entry.target));
}

async function recoverJournal(lockDir, name) {
  let journal;
  try {
    journal = await readJournal(lockDir, name);
  } catch (err) {
    return { ok: false, error: err };
  }
  const committed = await isCommitted(journal);
  const entries = committed ? (journal.ledger ?? []) : [...(journal.ledger ?? [])].reverse();
  let complete = true;
  for (const entry of entries) {
    try {
      if (committed) await commitEntry(entry);
      else await restoreEntry(entry);
    } catch {
      complete = false;
    }
  }
  if (complete) await unlink(resolve(lockDir, name)).catch(() => null);
  return { ok: complete };
}

async function recover(repoRoot, lockDir) {
  if (!existsSync(lockDir)) return { recovered: false, recoveredCount: 0 };
  if (await liveLockOwner(lockDir)) {
    return { recovered: false, recoveredCount: 0, blocked: true };
  }
  const { readdir } = await import("node:fs/promises");
  const names = await readdir(lockDir).catch(() => []);
  const journals = names.filter((n) => n.startsWith(".txn-") && n.endsWith(".journal"));
  if (!journals.length) {
    await releaseLock(lockDir);
    return { recovered: false, recoveredCount: 0 };
  }
  let totalRecovered = 0;
  let recoveryFailed = false;
  let recoveryError = null;
  for (const name of journals) {
    const result = await recoverJournal(lockDir, name);
    if (!result.ok) {
      recoveryFailed = true;
      if (result.error) recoveryError = result.error.message ?? String(result.error);
    } else {
      totalRecovered += 1;
    }
  }
  await releaseLock(lockDir);
  return {
    recovered: totalRecovered > 0,
    recoveredCount: totalRecovered,
    blocked: recoveryFailed,
    reason: recoveryFailed ? "recovery-failed" : null,
    recoveryError,
  };
}

async function commitEntry(entry) {
  let changed = false;
  if (entry.backup && existsSync(entry.backup)) {
    await unlink(entry.backup);
    changed = true;
  }
  if (entry.staged && existsSync(entry.staged)) {
    await unlink(entry.staged);
    changed = true;
  }
  if (changed) await fsyncDir(dirname(entry.target));
}

export async function executePlan({ repoRoot, plan, newLockBuilder }) {
  const lockDir = await lockDirForRepo(repoRoot);
  const recovered = await recover(repoRoot, lockDir);
  if (recovered.blocked) {
    const kind = recovered.reason ?? "lock-held";
    const message = kind === "lock-held"
      ? "another opencode-ship transaction is active"
      : `a previous opencode-ship transaction could not be recovered: ${recovered.recoveryError ?? "unknown error"}`;
    return { ok: false, error: { kind, message } };
  }
  const txnId = `txn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    await acquireLock(lockDir, txnId);
  } catch (e) {
    return { ok: false, error: { kind: "lock-held", message: e?.message ?? String(e) } };
  }

  const journal = { repoRoot, txnId, startedAt: new Date().toISOString(), entries: [] };

  try {
    await writeJournal(lockDir, txnId, journal);
    for (const op of plan) {
      if (op.op !== "file") continue;
      if (op.kind === "conflict" || op.kind === "noop" || op.kind === "converge") continue;

      const token = randomToken();
      const backup = backupPath(op.target, token);
      const staged = stagedPath(op.target, token);

      if (op.kind === "delete") {
        if (!existsSync(op.target)) continue;
        journal.entries.push({
          op: "delete", target: op.target, backup, staged: null, hadOriginal: true, mode: asMode(op.mode),
        });
        await writeJournal(lockDir, txnId, journal);
        await rename(op.target, backup);
      } else {
        await mkdirp(dirname(op.target));
        const hadOriginal = existsSync(op.target);
        journal.entries.push({
          op: "write",
          target: op.target,
          backup: hadOriginal ? backup : null,
          staged,
          hadOriginal,
          mode: asMode(op.mode),
        });
        await writeJournal(lockDir, txnId, journal);
        await writeFile(staged, op.bytes ?? Buffer.alloc(0), { mode: asMode(op.mode) });
        const h = await open(staged, "r+");
        await h.sync();
        await h.close();
        if (hadOriginal) await rename(op.target, backup);
        await rename(staged, op.target);
      }
      await fsyncDir(dirname(op.target));
    }

    if (newLockBuilder) {
      const lockValue = await newLockBuilder();
      const lockPathTarget = `${repoRoot}/.opencode/ship.lock.json`;
      await mkdirp(dirname(lockPathTarget));
      const token = randomToken();
      const backup = backupPath(lockPathTarget, token);
      const staged = stagedPath(lockPathTarget, token);
      const hadOriginal = existsSync(lockPathTarget);
      const finalLock = { ...lockValue, integrity: computeIntegrity(lockValue) };
      const lockBytes = JSON.stringify(finalLock, null, 2) + "\n";
      journal.entries.push({
        op: "write",
        target: lockPathTarget,
        backup: hadOriginal ? backup : null,
        staged,
        hadOriginal,
        commitMarker: true,
        installedSha256: bytesHashString(lockBytes),
        mode: 0o644,
      });
      await writeJournal(lockDir, txnId, journal);
      await writeFile(staged, lockBytes, { mode: 0o644 });
      const handle = await open(staged, "r+");
      await handle.sync();
      await handle.close();
      if (hadOriginal) await rename(lockPathTarget, backup);
      await rename(staged, lockPathTarget);
      await fsyncDir(dirname(lockPathTarget));
    }

    journal.committed = true;
    await writeJournal(lockDir, txnId, journal);
    let cleanupComplete = true;
    for (const entry of journal.entries) {
      try { await commitEntry(entry); } catch { cleanupComplete = false; }
    }
    if (cleanupComplete) await clearJournal(lockDir, txnId);
    return {
      ok: true,
      txnId,
      recovered: recovered.recovered ?? false,
      recoveredCount: recovered.recoveredCount ?? 0,
      cleanupPending: !cleanupComplete,
    };
  } catch (e) {
    await rollback(lockDir, journal);
    return { ok: false, error: { kind: "transaction-failed", message: e?.message ?? String(e) } };
  } finally {
    await releaseLock(lockDir);
  }
}

async function rollback(lockDir, journal) {
  const entries = journal.entries ?? journal.ledger ?? [];
  let complete = true;
  for (const entry of [...entries].reverse()) {
    try { await restoreEntry(entry); } catch { complete = false; }
  }
  if (complete && journal.txnId) await clearJournal(lockDir, journal.txnId);
}

export { withResourceLock, lockDirForRepo };
