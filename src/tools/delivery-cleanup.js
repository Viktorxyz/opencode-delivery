/**
 * delivery_cleanup tool.
 *
 * Removes the agent-owned local worktree once the PR is confirmed
 * merged, the worktree is clean, and the head matches the PR. Refuses
 * to operate on dirty worktrees, foreign worktrees, or worktrees
 * whose PR is not merged.
 */

import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import * as git from "../drivers/git.js";
import { transition } from "../state/lifecycle.js";
import { readManifest, writeManifest, deleteManifest } from "../state/manifest-store.js";
import { wouldCleanupBeSafe } from "../recovery.js";

function safeRemoveWorktree(repoRoot, path) {
  const r = spawnSync("git", ["worktree", "remove", path], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}

function safeDeleteBranch(repoRoot, branch) {
  const r = spawnSync("git", ["branch", "-D", branch], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}

export function createCleanupTool(deps) {
  return async function cleanup(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest" };
    if (m.state !== "merged" && m.state !== "cleanup-pending") {
      return { kind: "manifest-state", state: m.state };
    }
    if (!m.worktreePath) return { kind: "missing-worktree-path" };
    const wtPath = resolve(m.worktreePath);
    const mainCwd = resolve(deps.repoRoot);
    if (wtPath === mainCwd) return { kind: "current-checkout", worktreePath: wtPath };

    if (!git.isWorktreeClean(wtPath)) return { kind: "dirty-worktree" };
    if (git.isRebaseInProgress(wtPath)) return { kind: "rebase-in-progress" };
    if (m.prNumber === null) return { kind: "missing-pr" };
    const head = git.currentHead(wtPath);
    if (!head || (m.lastPrHeadSha && head !== m.lastPrHeadSha)) {
      return { kind: "head-mismatch", headSha: head ?? "", manifestSha: m.lastPrHeadSha ?? "" };
    }

    if (m.state !== "merged") return { kind: "manifest-state", state: m.state };
    if (!wouldCleanupBeSafe({
      prMerged: true,
      worktreeClean: true,
      rebaseInProgress: false,
      headMatchesPr: true,
      baseMatches: true,
    })) {
      return { kind: "manifest-state", state: m.state };
    }

    const removed = safeRemoveWorktree(deps.repoRoot, wtPath);
    if (removed.status !== 0) return { kind: "remove-failed", stderr: removed.stderr };
    safeDeleteBranch(deps.repoRoot, m.branch);

    const next = { ...m };
    const t = transition(next, "cleaned", { reason: "worktree removed" });
    if (t.ok && t.to === "cleaned") {
      const t2 = transition({ ...next, state: t.to, transitionLog: [...next.transitionLog, { from: t.from, to: t.to, at: t.at, reason: t.reason }], updatedAt: new Date().toISOString() }, "cleaned", { reason: "manifest sealed" });
      if (t2.ok) {
        await writeManifest(deps.repoRoot, { ...next, state: t2.to, transitionLog: [...next.transitionLog, { from: t2.from, to: t2.to, at: t2.at, reason: t2.reason }], updatedAt: new Date().toISOString() });
      }
      await deleteManifest(deps.repoRoot, input.taskId);
      return { contractVersion: 1, manifestPath: null, removedPath: wtPath };
    }
    return { kind: "manifest-state", state: m.state };
  };
}
