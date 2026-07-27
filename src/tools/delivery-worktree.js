/**
 * delivery_worktree tool.
 *
 * Creates an isolated worktree on a fresh branch from the adapter's
 * configured base ref. Refuses overwrites, refuses conflicts with
 * existing local/remote branches, refuses dirt in the main checkout,
 * and runs the adapter's bootstrap commands before recording the
 * worktree path in the manifest.
 */

import { resolve } from "node:path";
import { spawn } from "node:child_process";
import * as git from "../drivers/git.js";
import { readManifest, writeManifest } from "../state/manifest-store.js";
import { transition } from "../state/lifecycle.js";

function runBootstrap(args, cwd) {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn(args[0], args.slice(1), {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", rejectP);
    proc.on("close", (code) => {
      if (code !== 0) {
        rejectP(new Error(`bootstrap ${args.join(" ")} failed (exit ${code}): ${stderr.trim()}`));
      } else {
        resolveP();
      }
    });
  });
}

export function createWorktreeTool(deps) {
  return async function worktree(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
    if (m.state !== "issue-linked" && m.state !== "worktree-created") {
      return { kind: "manifest-state", state: m.state };
    }
    if (!input.branch) return { kind: "missing-input", field: "branch" };
    if (!input.worktreeRelativePath) return { kind: "missing-input", field: "worktreeRelativePath" };

    const remote = deps.remote ?? "origin";
    const hasRemote = git.remoteExists(remote, deps.repoRoot);
    if (hasRemote) {
      const fetched = git.fetchBranch(remote, m.baseBranch, deps.repoRoot);
      if (fetched.status !== 0) {
        return { kind: "remote-fetch", stderr: fetched.stderr };
      }
    }
    if (git.branchExistsLocally(input.branch, deps.repoRoot)) {
      return { kind: "branch-exists-locally", branch: input.branch };
    }
    if (git.branchExistsRemotely(remote, input.branch, deps.repoRoot)) {
      return { kind: "branch-exists-remotely", branch: input.branch };
    }
    const worktreePath = resolve(deps.repoRoot, input.worktreeRelativePath);
    if (git.worktreeExists(deps.repoRoot, worktreePath)) {
      return { kind: "worktree-exists" };
    }
    const baseRef = hasRemote ? `${remote}/${m.baseBranch}` : m.baseBranch;
    const created = git.createWorktree({
      cwd: deps.repoRoot,
      branch: input.branch,
      worktreePath,
      base: baseRef,
    });
    if (created.status !== 0) {
      return { kind: "create-failed", stderr: created.stderr };
    }
    const head = git.currentHead(worktreePath);
    if (!head) {
      return { kind: "create-failed", stderr: "no HEAD after worktree create" };
    }

    // Run adapter-declared bootstrap commands in the new worktree.
    const bootstrap = deps.adapter?.worktree?.bootstrap ?? [];
    for (const argv of bootstrap) {
      if (!Array.isArray(argv) || argv.length === 0) {
        return { kind: "bootstrap-invalid", bootstrap };
      }
      try {
        await runBootstrap(argv, worktreePath);
      } catch (e) {
        return { kind: "bootstrap-failed", stderr: e.message, argv };
      }
    }

    const baseSha =
      git.mergeBaseRemoteHead(remote, m.baseBranch, deps.repoRoot) ?? m.baseSha ?? null;
    if (!baseSha) return { kind: "missing-base-sha" };
    const t = transition(
      { ...m, worktreePath, branch: input.branch, baseSha },
      "worktree-created",
      { reason: "worktree created" },
    );
    if (!t.ok) return { kind: "lifecycle", reason: t.reason };
    const next = {
      ...m,
      worktreePath,
      branch: input.branch,
      baseSha,
      state: t.to,
      transitionLog: [
        ...m.transitionLog,
        { from: t.from, to: t.to, at: t.at, reason: t.reason },
      ],
      updatedAt: new Date().toISOString(),
    };
    const path = await writeManifest(deps.repoRoot, next);
    return {
      contractVersion: 1,
      branch: input.branch,
      worktreePath,
      headSha: head,
      manifestPath: path,
    };
  };
}
