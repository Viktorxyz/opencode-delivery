/**
 * delivery_worktree tool.
 *
 * Creates an isolated worktree on a fresh branch. Refuses overwrites,
 * refuses conflicts with existing branches, refuses dirt. Records
 * the worktree path in the manifest.
 */

import { resolve } from "node:path";
import * as git from "../drivers/git.ts";
import { readManifest, writeManifest } from "../state/manifest-store.ts";
import { transition } from "../state/lifecycle.js";

export const WorktreeDeps = {
  repoRoot: string;
  remote: string;
};

export const WorktreeInput = {
  taskId: string;
  branch: string;
  worktreeRelativePath: string;
};

export const WorktreeOutput = {
  contractVersion: 1;
  branch: string;
  worktreePath: string;
  headSha: string;
  manifestPath: string;
};

export const WorktreeError = | { kind: "missing-manifest"; taskId: string }
  | { kind: "manifest-state"; state: string }
  | { kind: "remote-fetch"; stderr: string }
  | { kind: "branch-exists-locally" }
  | { kind: "branch-exists-remotely" }
  | { kind: "worktree-exists" }
  | { kind: "create-failed"; stderr: string };

export function createWorktreeTool(deps) {
  return async function worktree(input: WorktreeInput){
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
    if (m.state !== "issue-linked" && m.state !== "worktree-created") {
      return { kind: "manifest-state", state: m.state };
    }
    const fetched = git.fetchBranch(deps.remote, m.baseBranch, deps.repoRoot);
    if (fetched.status !== 0) return { kind: "remote-fetch", stderr: fetched.stderr };
    if (git.branchExistsLocally(input.branch, deps.repoRoot)) return { kind: "branch-exists-locally" };
    if (git.branchExistsRemotely(deps.remote, input.branch, deps.repoRoot)) return { kind: "branch-exists-remotely" };
    const worktreePath = resolve(deps.repoRoot, input.worktreeRelativePath);
    if (git.worktreeExists(deps.repoRoot, worktreePath)) return { kind: "worktree-exists" };
    const created = git.createWorktree({
      cwd,
      branch,
      base: `${deps.remote}/${m.baseBranch}`,
    });
    if (created.status !== 0) return { kind: "create-failed", stderr: created.stderr };
    const head = git.currentHead(worktreePath);
    if (!head) return { kind: "create-failed", stderr: "no HEAD after worktree create" };
    const t = transition(
      { ...m, worktreePath, branch, baseSha: git.mergeBaseRemoteHead(deps.remote, m.baseBranch, deps.repoRoot) ?? m.baseSha },
      "worktree-created",
      { reason: "worktree created" },
    );
    if (!t.ok) return { kind: "manifest-state", state: m.state };
    const path = await writeManifest(deps.repoRoot, t.to === "worktree-created" ? { ...m, worktreePath, branch, baseSha: git.mergeBaseRemoteHead(deps.remote, m.baseBranch, deps.repoRoot) ?? m.baseSha, state, transitionLog: [...m.transitionLog, { from, to, at, reason: t.reason }], updatedAt: new Date().toISOString() } : m);
    return {
      contractVersion: 1,
      branch,
      headSha,
      manifestPath,
    };
  };
}
