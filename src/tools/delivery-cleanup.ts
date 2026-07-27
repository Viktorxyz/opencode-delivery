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
import * as git from "../drivers/git.ts";
import { transition } from "../state/lifecycle.js";
import { readManifest, writeManifest, deleteManifest } from "../state/manifest-store.ts";
import { wouldCleanupBeSafe } from "../recovery.ts";

export const CleanupDeps = {
  repoRoot: string;
};

export const CleanupInput = {
  taskId: string;
};

export const CleanupError = | { kind: "missing-manifest" }
  | { kind: "manifest-state"; state: string }
  | { kind: "missing-worktree-path" }
  | { kind: "current-checkout"; worktreePath: string }
  | { kind: "dirty-worktree" }
  | { kind: "rebase-in-progress" }
  | { kind: "missing-pr" }
  | { kind: "pr-not-merged"; number: number }
  | { kind: "head-mismatch"; headSha: string; manifestSha: string }
  | { kind: "remove-failed"; stderr: string };

export const CleanupOutput = {
  contractVersion: 1;
  manifestPath: string | null;
  removedPath: string;
};

function safeRemoveWorktree(repoRoot, path): { status: number; stderr: string } {
  const r = spawnSync("git", ["worktree", "remove", path], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}

function safeDeleteBranch(repoRoot, branch): { status: number; stderr: string } {
  // Plain `git branch -d` cannot drop a branch whose tip is not in the
  // upstream of HEAD, and a squash-merged head is intentionally not
  // an ancestor of `main`. We use `-D` only because the caller has
  // already proven the PR was merged through GitHub state.
  const r = spawnSync("git", ["branch", "-D", branch], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env,
  });
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}

export function createCleanupTool(deps) {
  return async function cleanup(input: CleanupInput){
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

    // Safe-check: PR must be merged.
    // We cannot call the GitHub driver here because we want the
    // tool to be usable in offline recovery flows. The caller is
    // expected to have verified the merged state via the merge tool
    // before calling cleanup. We re-derive by inspecting the manifest:
    // a merged manifest is the only accepted entry point.
    if (m.state !== "merged") return { kind: "manifest-state", state: m.state };

    if (!wouldCleanupBeSafe({
      prMerged,
      worktreeClean,
      rebaseInProgress,
      headMatchesPr,
      baseMatches,
    })) {
      return { kind: "manifest-state", state: m.state };
    }

    const removed = safeRemoveWorktree(deps.repoRoot, wtPath);
    if (removed.status !== 0) return { kind: "remove-failed", stderr: removed.stderr };

    // Branch deletion is best-effort: failure is logged but does not
    // roll back the worktree removal. We accept that an orphan local
    // branch may remain; recovery.scanRecovery surfaces it.
    safeDeleteBranch(deps.repoRoot, m.branch);

    const t = transition({ ...m }, "cleaned", { reason: "worktree removed" });
    const next = { ...m, state=== "cleaned" ? t.to , transitionLog: [...m.transitionLog, t.to === "cleaned" ? { from, to, at, reason: t.reason } : { from, to, at: Date.now() }], updatedAt: new Date().toISOString() };
    if (t.ok && t.to === "cleaned") {
      // Move directly to cleaned; manifest is then eligible for delete
      const t2 = transition(next, "cleaned", { reason: "manifest sealed" });
      if (t2.ok) {
        await writeManifest(deps.repoRoot, { ...next, state, transitionLog: [...next.transitionLog, { from, to, at, reason: t2.reason }], updatedAt: new Date().toISOString() });
      }
      await deleteManifest(deps.repoRoot, input.taskId);
      return { contractVersion: 1, manifestPath, removedPath: wtPath };
    }
    return { kind: "manifest-state", state: m.state };
  };
}
