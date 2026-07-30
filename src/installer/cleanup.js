/*
 * Post-merge cleanup helpers.
 *
 * After an authorised `delivery_merge`, the lifecycle reaches the
 * `merged` state. The plugin invokes `tryImmediateCleanup` as soon
 * as it observes that state, so the agent-owned worktree, the local
 * branch, and the manifest are removed without further user action.
 *
 * If a step fails we record the failure in
 * `.opencode/ship.lock.json#cleanupPending` so the next delivery
 * task or plugin startup retries. Cleanup is always precondition
 * bound: merged PR, manifest-owned worktree inside the configured
 * root, clean state, expected HEAD, no rebase, no unpublished
 * commits, and worktree path under the configured worktree.root.
 */

import { spawnSync } from "node:child_process";
import { resolve as pathResolve } from "node:path";
import { listManifests, readManifest, writeManifest, deleteManifest } from "../state/manifest-store.js";
import { setPointer, getPointer } from "./json-pointer.js";
import { stableStringify } from "./json-pointer.js";
import { bytesHashString } from "./hash.js";
import { readLock, lockPath } from "./lock.js";

function spawn(repoRoot, args) {
  const r = spawnSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function casDeleteBranch(repoRoot, branch, expectedSha) {
  const argv = ["update-ref", "-d"];
  if (expectedSha && /^[0-9a-f]{7,}$/i.test(expectedSha)) {
    argv.push(`refs/heads/${branch}`, expectedSha);
  } else {
    argv.push(`refs/heads/${branch}`);
  }
  return spawn(repoRoot, argv).status ?? -1;
}

function safeRemoveWorktree(repoRoot, target) {
  const r = spawn(repoRoot, ["worktree", "remove", target]);
  return { status: r.status, stderr: r.stderr };
}

function worktreeRootOf(adapter) {
  return adapter?.worktree?.root ?? ".worktrees";
}

async function loadLockMemo(repoRoot) {
  return readLock(repoRoot);
}

async function writeLockMemo(repoRoot, lock) {
  const { writeLock: writer } = await import("./lock.js");
  await writer(repoRoot, lock);
}

async function appendCleanupPending(repoRoot, entry) {
  const lock = await loadLockMemo(repoRoot);
  if (!lock) return null;
  const next = [...(lock.cleanupPending ?? []), entry];
  await writeLockMemo(repoRoot, { ...lock, cleanupPending: dedupePending(next) });
  return lock;
}

function dedupePending(entries) {
  const seen = new Set();
  const out = [];
  for (const e of entries) {
    if (!e || !e.taskId) continue;
    if (seen.has(e.taskId)) continue;
    seen.add(e.taskId);
    out.push(e);
  }
  return out;
}

function reject(reason, extra = {}) {
  return { ok: false, reason, ...extra };
}

export async function tryImmediateCleanup({ repoRoot, taskId, adapter }) {
  if (!repoRoot || !taskId) return reject("missing-args");
  const m = await readManifest(repoRoot, taskId);
  if (!m) return reject("missing-manifest");
  if (m.state !== "merged" && m.state !== "cleanup-pending") {
    return reject("manifest-state", { state: m.state });
  }
  if (!m.worktreePath) return reject("missing-worktree-path");
  const wtPath = pathResolve(m.worktreePath);
  const mainCwd = pathResolve(repoRoot);
  if (wtPath === mainCwd) return reject("current-checkout", { worktreePath: wtPath });
  const rootAbs = pathResolve(repoRoot, worktreeRootOf(adapter));
  if (!wtPath.startsWith(rootAbs + "/")) {
    return reject("worktree-out-of-root", { expected: rootAbs, got: wtPath });
  }

  const status = spawn(wtPath, ["status", "--porcelain"]);
  if (status.status === 0 && status.stdout.trim().length > 0) return reject("dirty-worktree");
  const rebase = spawn(wtPath, ["rev-parse", "--verify", "--quiet", "REBASE_HEAD"]);
  if (rebase.status === 0) return reject("rebase-in-progress");

  const head = spawn(wtPath, ["rev-parse", "HEAD"]);
  if (head.status !== 0) return reject("no-head");
  const headSha = head.stdout.trim();
  if (m.lastPrHeadSha && headSha !== m.lastPrHeadSha) {
    return reject("head-mismatch", { expected: m.lastPrHeadSha, actual: headSha });
  }

  const removed = safeRemoveWorktree(repoRoot, wtPath);
  if (removed.status !== 0) {
    await appendCleanupPending(repoRoot, {
      taskId, failedAt: new Date().toISOString(),
      stage: "worktree-remove", reason: removed.stderr ?? "non-zero exit",
    });
    return reject("remove-failed", { detail: removed.stderr });
  }
  const branchDelete = casDeleteBranch(repoRoot, m.branch, headSha);
  const branchStillThere = spawn(repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${m.branch}`]);
  if (branchDelete !== 0 && branchStillThere.status === 0) {
    await appendCleanupPending(repoRoot, {
      taskId, failedAt: new Date().toISOString(),
      stage: "branch-delete", reason: "git update-ref failed",
    });
    return reject("branch-delete-failed");
  }

  const next = {
    ...m,
    state: "cleaned",
    transitionLog: [
      ...m.transitionLog,
      { from: m.state, to: "cleaned", at: Date.now(), reason: "immediate cleanup" },
    ],
    updatedAt: new Date().toISOString(),
  };
  await writeManifest(repoRoot, next).catch(() => null);
  await deleteManifest(repoRoot, taskId);
  return { ok: true, removedPath: wtPath, sealed: true };
}

export async function listPending(repoRoot) {
  const all = await listManifests(repoRoot).catch(() => []);
  return all.filter((m) => m.state === "merged" || m.state === "cleanup-pending");
}
