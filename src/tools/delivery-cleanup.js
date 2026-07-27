/**
 * delivery_cleanup tool.
 *
 * Removes the agent-owned local worktree once the PR is confirmed
 * merged, the worktree is clean, the head matches the merged PR, the
 * base branch matches the manifest's, and there are no unpublished
 * commits. Refuses dirty worktrees, rebases, base mismatches, and
 * unmerged PRs. Uses `git branch -d` (not `-D`) so a branch with
 * unmerged commits survives cleanup.
 */

import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import * as git from "../drivers/git.js";
import { transition } from "../state/lifecycle.js";
import { readManifest, writeManifest, deleteManifest } from "../state/manifest-store.js";

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
  // `git branch -d` only succeeds when the branch is fully merged; that
  // is the exact safety property we want. Never use `-D` here.
  const r = spawnSync("git", ["branch", "-d", branch], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}

function aheadCount(repoRoot, branch, remote) {
  const r = spawnSync(
    "git",
    ["rev-list", "--count", `${remote}/${branch}..${branch}`],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env },
  );
  if (r.status !== 0) return null;
  const n = parseInt(r.stdout.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

export function createCleanupTool(deps) {
  return async function cleanup(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
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
      return {
        kind: "head-mismatch",
        headSha: head ?? "",
        manifestSha: m.lastPrHeadSha ?? "",
      };
    }

    const pr = await deps.driver.readPullRequest({
      repo: deps.repoSlug,
      number: m.prNumber,
    });
    if (!pr.merged) {
      return {
        kind: "unmerged",
        headSha: pr.headSha,
        manifestSha: m.lastPrHeadSha ?? "",
      };
    }
    if (pr.baseRefName !== m.baseBranch) {
      return { kind: "base-mismatch", manifestBase: m.baseBranch, prBase: pr.baseRefName };
    }

    const remote = deps.remote ?? "origin";
    const ahead = aheadCount(wtPath, m.branch, remote);
    if (ahead === null || ahead > 0) {
      return {
        kind: "has-unpublished-commits",
        ahead: ahead ?? -1,
        branch: m.branch,
        remote,
      };
    }

    const removed = safeRemoveWorktree(deps.repoRoot, wtPath);
    if (removed.status !== 0) {
      return { kind: "remove-failed", stderr: removed.stderr };
    }
    const branchResult = safeDeleteBranch(deps.repoRoot, m.branch);
    if (branchResult.status !== 0) {
      return { kind: "branch-delete-failed", stderr: branchResult.stderr };
    }

    const tCleanup = transition(m, "cleanup-pending", { reason: "worktree removed" });
    const candidate = tCleanup.ok
      ? {
          ...m,
          state: tCleanup.to,
          transitionLog: [
            ...m.transitionLog,
            { from: tCleanup.from, to: tCleanup.to, at: tCleanup.at, reason: tCleanup.reason },
          ],
          updatedAt: new Date().toISOString(),
        }
      : m;

    const tCleaned = transition(candidate, "cleaned", { reason: "manifest sealed" });
    if (tCleaned.ok) {
      const sealed = {
        ...candidate,
        state: tCleaned.to,
        transitionLog: [
          ...candidate.transitionLog,
          { from: tCleaned.from, to: tCleaned.to, at: tCleaned.at, reason: tCleaned.reason },
        ],
        updatedAt: new Date().toISOString(),
      };
      await writeManifest(deps.repoRoot, sealed);
      await deleteManifest(deps.repoRoot, input.taskId);
    }
    return { contractVersion: 1, manifestPath: null, removedPath: wtPath };
  };
}
