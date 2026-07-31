/*
 * Project detection.
 *
 * Resolves the consumer repository from the current working directory.
 * Detection is read-only and never fetches remote state.
 *
 * Inputs: optional explicit root. Otherwise the current working
 * directory.
 *
 * Outputs: { repoRoot, repository, defaultBranch, packageManager,
 *   verificationPlan, worktreeRoot, owner, worktreeBootstrap,
 *   remoteCandidates, hasRemote, errors }.
 *
 * The module is dependency-free with respect to the rest of the
 * installer; it spawns `git --no-pager` and reads package.json +
 * lockfiles synchronously so the caller can pre-flight a plan in a
 * single shell call. Detailed error reporting lets `init` surface a
 * helpful message instead of a generic "no project detected".
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

function runGit(cwd, args) {
  const r = spawnSync("git", ["-C", cwd, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

function detectPackageManager(repoRoot) {
  if (existsSync(join(repoRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync(join(repoRoot, "yarn.lock"))) return "yarn";
  if (existsSync(join(repoRoot, "bun.lockb"))) return "bun";
  if (existsSync(join(repoRoot, "package-lock.json"))) return "npm";
  return null;
}

function readPackageJson(repoRoot) {
  const path = join(repoRoot, "package.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function planFromScripts(pkg, packageManager) {
  const scripts = pkg?.scripts ?? {};
  const runner = packageManager === "npm" ? "npm" : packageManager || "npm";
  const candidate = (name) =>
    typeof scripts[name] === "string" ? scripts[name].trim() : null;
  if (candidate("verify") || candidate("verify:workspace")) {
    const name = candidate("verify:workspace") ? "verify:workspace" : "verify";
    const cmd = candidate(name);
    return [{ id: "canonical", argv: [runner, "run", name], inferredFrom: "verify", command: cmd }];
  }
  const steps = [];
  if (candidate("typecheck")) steps.push({ id: "typecheck", argv: [runner, "run", "typecheck"], script: "typecheck" });
  if (candidate("lint")) steps.push({ id: "lint", argv: [runner, "run", "lint"], script: "lint" });
  if (candidate("test")) steps.push({ id: "test", argv: [runner, "run", "test"], script: "test" });
  return steps;
}

function bootstrapFor(packageManager) {
  if (packageManager === "pnpm") return [["pnpm", "install", "--frozen-lockfile"]];
  if (packageManager === "yarn") return [["yarn", "install", "--frozen-lockfile"]];
  if (packageManager === "bun") return [["bun", "install", "--frozen-lockfile"]];
  if (packageManager === "npm") return [["npm", "ci"]];
  return [];
}

function parseRepoSlugFromRemote(url) {
  if (!url) return null;
  const ssh = url.match(/^git@[^:]+:(.+?)(?:\.git)?$/);
  if (ssh) return ssh[1].replace(/^\/+|\/+$/g, "");
  const https = url.match(/^https?:\/\/[^/]+\/(.+?)(?:\.git)?$/);
  if (https) return https[1].replace(/^\/+|\/+$/g, "");
  return null;
}

function detectRemote(repoRoot) {
  const remotes = runGit(repoRoot, ["remote", "-v"]);
  if (remotes.status !== 0) return { candidates: [], primary: null };
  const lines = remotes.stdout.split("\n").filter(Boolean);
  const map = new Map();
  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
    if (!match) continue;
    const name = match[1];
    const url = match[2];
    if (!map.has(name)) map.set(name, { name, url });
  }
  const list = Array.from(map.values());
  const origin = list.find((r) => r.name === "origin") ?? list[0] ?? null;
  return { candidates: list, primary: origin };
}

function detectDefaultBranch(repoRoot, remoteName) {
  const head = runGit(repoRoot, ["symbolic-ref", `refs/remotes/${remoteName}/HEAD`]);
  if (head.status === 0) {
    const ref = head.stdout.trim();
    const match = ref.match(/^refs\/remotes\/[^/]+\/(.+)$/);
    if (match) return match[1];
  }
  const local = runGit(repoRoot, ["remote", "show", remoteName]);
  if (local.status === 0) {
    const match = local.stdout.match(/HEAD branch:\s*(\S+)/);
    if (match) return match[1];
  }
  const branch = runGit(repoRoot, ["branch", "--list"]);
  if (branch.status === 0 && /\*\s*main\b/.test(branch.stdout)) return "main";
  return null;
}

function detectOwner(repoRoot) {
  const user = runGit(repoRoot, ["config", "--get", "user.name"]);
  if (user.status === 0 && user.stdout.trim()) return user.stdout.trim();
  const fallback = process.env.USER ?? process.env.USERNAME ?? "opencode-ship";
  return fallback;
}

export function detectProject(repoRoot = process.cwd()) {
  const errors = [];
  const cwd = resolve(repoRoot);
  const inside = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (inside.status !== 0) {
    errors.push({ kind: "not-a-git-repo", path: cwd, detail: inside.stderr.trim() });
    return { repoRoot: cwd, errors };
  }
  const repoRootActual = inside.stdout.trim();
  const headBranch = runGit(repoRootActual, ["symbolic-ref", "--short", "HEAD"]);
  if (headBranch.status !== 0 || headBranch.stdout.trim().length === 0) {
    errors.push({ kind: "detached-head", path: repoRootActual, detail: headBranch.stderr.trim() });
  }

  const remote = detectRemote(repoRootActual);
  let repository = null;
  let defaultBranch = null;
  if (remote.primary) {
    repository = parseRepoSlugFromRemote(remote.primary.url);
    defaultBranch = detectDefaultBranch(repoRootActual, remote.primary.name);
  }
  if (!repository) {
    errors.push({ kind: "no-remote", path: repoRootActual, detail: "no usable remote for github detection" });
  }
  if (!defaultBranch) {
    defaultBranch = "main";
  }

  const packageJson = readPackageJson(repoRootActual);
  const packageManager = detectPackageManager(repoRootActual);
  const verificationPlan = planFromScripts(packageJson, packageManager);
  const worktreeBootstrap = bootstrapFor(packageManager);
  const owner = detectOwner(repoRootActual);

  return {
    repoRoot: repoRootActual,
    repository,
    defaultBranch,
    remote: remote.primary?.name ?? null,
    remoteCandidates: remote.candidates,
    packageManager,
    packageJson,
    verificationPlan,
    worktreeBootstrap,
    worktreeRoot: ".worktrees",
    owner,
    headBranch: headBranch.stdout.trim() || null,
    errors,
  };
}
