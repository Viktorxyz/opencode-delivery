/**
 * delivery_cleanup tool.
 *
 * Removes the agent-owned local worktree once the PR is confirmed
 * merged, the worktree is clean, the head matches the merged PR, the
 * base branch matches the manifest's, and there are no unpublished
 * commits. Uses a CAS-style expected-SHA guard: when the remote
 * feature branch has been deleted by GitHub (post-merge), cleanup
 * proceeds as long as the local branch head matches the recorded
 * `lastPrHeadSha`. The deletion never uses `git branch -D`; `-d` is
 * the only safe form.
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
  const r = spawnSync("git", ["branch", "-d", branch], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}

function remoteBranchGone(repoRoot, branch, remote) {
  const r = spawnSync("git", ["ls-remote", "--heads", remote, branch], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
  return r.status === 0 && !r.stdout.includes(`refs/heads/${branch}`);
}

function aheadOfRemote(repoRoot, branch, remote) {
  const r = spawnSync(
    "git",
    ["rev-list", "--count", `${remote}/${branch}..${branch}`],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env },
  );
  if (r.status !== 0) return null;
  const n = parseInt(r.stdout.trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function aheadOfAnywhere(repoRoot, branch) {
  const r = spawnSync(
    "git",
    ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env },
  );
  if (r.status !== 0) return null;
  const heads = r.stdout.split("\n").map((s) => s.trim()).filter(Boolean);
  for (const ref of heads) {
    if (ref === `refs/heads/${branch}`) continue;
    const r2 = spawnSync(
      "git",
      ["rev-list", "--count", `${ref}..${branch}`],
      { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env },
    );
    if (r2.status !== 0) continue;
    const n = parseInt(r2.stdout.trim(), 10);
    if (Number.isFinite(n) && n > 0) return { ref, ahead: n };
  }
  return null;
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
    const remoteGone = remoteBranchGone(wtPath, m.branch, remote);
    const ahead = remoteGone ? null : aheadOfRemote(wtPath, m.branch, remote);

    // Unpublished-commit guard:
    //   - remote ref gone AND head matches expected -> safe (squash merge deleted remote)
    //   - remote ref gone AND head mismatch -> refuse (already covered by head-mismatch above)
    //   - remote ref present AND ahead == 0 -> safe
    //   - remote ref present AND ahead > 0  -> refuse (has-unpublished-commits)
    //   - remote ref absent AND ahead could not be measured against any ref -> refuse
    //     unless the head is known to match lastPrHeadSha (already guarded)
    if (!remoteGone && ahead !== null && ahead > 0) {
      return {
        kind: "has-unpublished-commits",
        ahead,
        branch: m.branch,
        remote,
      };
    }
    if (!remoteGone && ahead === null) {
      const drift = aheadOfAnywhere(wtPath, m.branch);
      if (drift && drift.ahead > 0) {
        return {
          kind: "has-unpublished-commits",
          ahead: drift.ahead,
          branch: m.branch,
          ref: drift.ref,
        };
      }
    }

    const removed = safeRemoveWorktree(deps.repoRoot, wtPath);
    if (removed.status !== 0) {
      return { kind: "remove-failed", stderr: removed.stderr };
    }
    const branchResult = safeDeleteBranch(deps.repoRoot, m.branch);
    if (branchResult.status !== 0) {
      // The branch may already be gone (squash-merge deleted remote +
      // the local ref). Treat as success when the branch is absent.
      const stillExists = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${m.branch}`], {
        cwd: deps.repoRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: process.env,
      });
      if (stillExists.status === 0) {
        return { kind: "branch-delete-failed", stderr: branchResult.stderr };
      }
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
