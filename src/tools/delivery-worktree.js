/**
 * delivery_worktree tool.
 *
 * Creates an isolated worktree on a fresh branch. Refuses overwrites,
 * refuses conflicts with existing branches, refuses dirt. Records
 * the worktree path in the manifest.
 */

import { resolve } from "node:path";
import * as git from "../drivers/git.js";
import { readManifest, writeManifest } from "../state/manifest-store.js";
import { transition } from "../state/lifecycle.js";

export function createWorktreeTool(deps) {
  return async function worktree(input) {
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
      cwd: deps.repoRoot,
      branch: input.branch,
      worktreePath: input.worktreePath,
      base: `${deps.remote}/${m.baseBranch}`,
    });
    if (created.status !== 0) return { kind: "create-failed", stderr: created.stderr };
    const head = git.currentHead(worktreePath);
    if (!head) return { kind: "create-failed", stderr: "no HEAD after worktree create" };
    const baseSha = git.mergeBaseRemoteHead(deps.remote, m.baseBranch, deps.repoRoot) ?? m.baseSha;
    const t = transition(
      { ...m, worktreePath, branch: input.branch, baseSha },
      "worktree-created",
      { reason: "worktree created" },
    );
    if (!t.ok) return { kind: "manifest-state", state: m.state };
    const next = {
      ...m,
      worktreePath: input.worktreePath,
      branch: input.branch,
      baseSha: input.baseSha,
      state: t.to,
      transitionLog: [...m.transitionLog, { from: t.from, to: t.to, at: t.at, reason: t.reason }],
      updatedAt: new Date().toISOString(),
    };
    const path = await writeManifest(deps.repoRoot, t.to === "worktree-created" ? next : m);
    return {
      contractVersion: 1,
      branch: input.branch,
      worktreePath: input.worktreePath,
      headSha: head,
      manifestPath: path,
    };
  };
}
