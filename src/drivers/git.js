/**
 * Minimal git worktree / branch driver.
 *
 * Implements the worktree primitives the lifecycle state machine needs,
 * with no shell glob interpretation: every command is `spawnSync(git, argv)`.
 *
 * The driver is intentionally small; it does not implement merging,
 * pushing, or fetching. Those responsibilities belong to the GitHub
 * driver or to a higher-level tool wrapper.
 */

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

export const WorktreeRecord = {
  path: "",
  branch: "",
  head: "",
};

function runGit(args, cwd) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });
}

export function isInsideWorktree(cwd) {
  const r = runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  return r.status === 0 && r.stdout.trim() === "true";
}

export function isMainCheckout(cwd) {
  const common = runGit(["rev-parse", "--git-common-dir"], cwd);
  const dir = runGit(["rev-parse", "--git-dir"], cwd);
  if (common.status !== 0 || dir.status !== 0) return false;
  return common.stdout.trim() === dir.stdout.trim();
}

export function listWorktrees(cwd) {
  const r = runGit(["worktree", "list", "--porcelain"], cwd);
  if (r.status !== 0) return [];
  const records = [];
  let cur = {};
  for (const line of r.stdout.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (cur.path && cur.branch && cur.head) {
        records.push({ path: cur.path, branch: cur.branch, head: cur.head });
      }
      cur = { path: line.slice("worktree ".length).trim() };
    } else if (line.startsWith("HEAD ")) {
      cur.head = line.slice("HEAD ".length).trim();
    } else if (line.startsWith("branch ")) {
      cur.branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    }
  }
  if (cur.path && cur.branch && cur.head) {
    records.push({ path: cur.path, branch: cur.branch, head: cur.head });
  }
  return records;
}

export function isWorktreeClean(cwd) {
  const r = runGit(["status", "--porcelain"], cwd);
  if (r.status !== 0) return false;
  return r.stdout.trim().length === 0;
}

export function isRebaseInProgress(cwd) {
  const merge = runGit(["rev-parse", "--git-path", "rebase-merge"], cwd);
  const apply = runGit(["rev-parse", "--git-path", "rebase-apply"], cwd);
  const mergeExists = merge.status === 0 && safeExists(resolve(cwd, merge.stdout.trim()));
  const applyExists = apply.status === 0 && safeExists(resolve(cwd, apply.stdout.trim()));
  return mergeExists || applyExists;
}

function safeExists(p) {
  try {
    const fs = require("node:fs");
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export function currentBranch(cwd) {
  const r = runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (r.status !== 0) return null;
  const out = r.stdout.trim();
  if (out === "HEAD") return null;
  return out;
}

export function revParse(ref, cwd) {
  const r = runGit(["rev-parse", "--verify", ref], cwd);
  return r.status === 0 ? r.stdout.trim() : null;
}

export function fetchBranch(remote, branch, cwd) {
  const r = runGit(["fetch", remote, branch], cwd);
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}

export function createWorktree(opts) {
  const args = ["worktree", "add", "-b", opts.branch, opts.worktreePath, opts.base];
  const r = runGit(args, opts.cwd);
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}

export function worktreeExists(cwd, path) {
  return listWorktrees(cwd).some((w) => w.path === path);
}

export function branchExistsLocally(branch, cwd) {
  const r = runGit(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], cwd);
  return r.status === 0;
}

export function branchExistsRemotely(remote, branch, cwd) {
  const r = runGit(["ls-remote", "--heads", remote, branch], cwd);
  return r.status === 0 && r.stdout.includes(`refs/heads/${branch}`);
}

export function mergeIntoFeature(branch, base, cwd) {
  const r = runGit(["merge", `--into-name=${branch}`, base], cwd);
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}

export function currentHead(cwd) {
  const r = runGit(["rev-parse", "HEAD"], cwd);
  return r.status === 0 ? r.stdout.trim() : null;
}

export function push(remote, branch, cwd) {
  const r = runGit(["push", remote, branch], cwd);
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}

export function pushForceDisabled(_remote, _branch, cwd) {
  return { status: 1, stderr: "force-push is not permitted by the delivery driver" };
}

export function defaultBranch(cwd) {
  const r = runGit(["rev-parse", "--abbrev-ref", "HEAD", "@{u}"], cwd);
  if (r.status !== 0) {
    const head = runGit(["symbolic-ref", "--short", "HEAD"], cwd);
    return head.status === 0 ? head.stdout.trim() : null;
  }
  const out = r.stdout.trim();
  const slash = out.indexOf("/");
  return slash >= 0 ? out.slice(slash + 1) : out;
}

export function mergeBaseRemoteHead(remote, branch, cwd) {
  const r = runGit(["rev-parse", "--verify", `${remote}/${branch}`], cwd);
  return r.status === 0 ? r.stdout.trim() : null;
}
