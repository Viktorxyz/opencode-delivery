/*
 * Post-merge cleanup helpers.
 *
 * After an authorised `delivery_merge`, the lifecycle reaches the
 * `merged` state. The plugin's hook immediately invokes
 * `delivery_cleanup` (queued in this module) so the agent-owned
 * worktree, the local branch, and the manifest are removed without
 * another user interaction.
 *
 * If any step fails, we record the failure in
 * `.opencode/ship.lock.json#cleanupPending` so the next delivery task
 * or `opencode-ship update` retries. The cleanup is always
 * precondition-bound: merged PR, manifest-owned worktree, clean
 * state, expected HEAD, no unpublished commits.
 */

import { listManifests, readManifest, writeManifest, deleteManifest } from "../state/manifest-store.js";
import { spawnSync } from "node:child_process";
import { resolve as pathResolve } from "node:path";

function spawnGit(repoRoot, args) {
  const r = spawnSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function casDeleteBranch(repoRoot, branch, expectedSha) {
  const args = ["update-ref", "-d"];
  if (expectedSha && /^[0-9a-f]{7,}$/i.test(expectedSha)) {
    args.push(`refs/heads/${branch}`, expectedSha);
  } else {
    args.push(`refs/heads/${branch}`);
  }
  return spawnSync("git", ["-C", repoRoot, ...args], { encoding: "utf8" }).status ?? -1;
}

function safeRemoveWorktree(repoRoot, target) {
  const r = spawnSync("git", ["-C", repoRoot, "worktree", "remove", target], { encoding: "utf8" });
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}

async function persist(recover, repoRoot, manifest, state, reason) {
  void recover;
  const next = {
    ...manifest,
    state,
    transitionLog: [
      ...manifest.transitionLog,
      { from: manifest.state, to: state, at: Date.now(), reason },
    ],
    updatedAt: new Date().toISOString(),
  };
  await writeManifest(repoRoot, next);
  return next;
}

export async function tryImmediateCleanup({ repoRoot, taskId, adapter }) {
  const m = await readManifest(repoRoot, taskId);
  if (!m) return { ok: false, reason: "missing-manifest" };
  if (m.state !== "merged" && m.state !== "cleanup-pending") {
    return { ok: false, reason: "manifest-state" };
  }
  if (!m.worktreePath) return { ok: false, reason: "missing-worktree-path" };
  const wtPath = pathResolve(m.worktreePath);
  const mainCwd = pathResolve(repoRoot);
  if (wtPath === mainCwd) return { ok: false, reason: "current-checkout" };
  const rootAbs = pathResolve(repoRoot, adapter?.worktree?.root ?? ".worktrees");
  if (!wtPath.startsWith(rootAbs + "/")) return { ok: false, reason: "out-of-root" };

  const status = spawnGit(wtPath, ["status", "--porcelain"]);
  if (status.status === 0 && status.stdout.trim().length > 0) return { ok: false, reason: "dirty-worktree" };

  const head = spawnGit(wtPath, ["rev-parse", "HEAD"]);
  if (head.status !== 0) return { ok: false, reason: "no-head" };
  const headSha = head.stdout.trim();
  if (m.lastPrHeadSha && headSha !== m.lastPrHeadSha) {
    return { ok: false, reason: "head-mismatch", expected: m.lastPrHeadSha, actual: headSha };
  }

  const removed = safeRemoveWorktree(repoRoot, wtPath);
  if (removed.status !== 0) return { ok: false, reason: "remove-failed", detail: removed.stderr };
  const branchResult = casDeleteBranch(repoRoot, m.branch, headSha);
  if (branchResult !== 0) {
    const exists = spawnGit(repoRoot, ["show-ref", "--verify", "--quiet", `refs/heads/${m.branch}`]);
    if (exists.status === 0) return { ok: false, reason: "branch-delete-failed" };
  }
  const next = await persist(null, repoRoot, m, "cleaned", "immediate cleanup");
  await deleteManifest(repoRoot, taskId);
  return { ok: true, sealed: next, removedPath: wtPath };
}

export async function listPending(repoRoot) {
  const all = await listManifests(repoRoot);
  return all.filter((m) => m.state === "merged" || m.state === "cleanup-pending");
}
