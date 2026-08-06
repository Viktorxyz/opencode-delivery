// opencode-ship/core v0.10.0-rc.1

// src/adapter.js
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";
var ADAPTER_CONTRACT_VERSION = 1;
var LOCK_FILENAME = "delivery.lock.json";
var ADAPTER_FILENAME = "delivery.json";
var KNOWN_KEYS = /* @__PURE__ */ new Set([
  "contractVersion",
  "repository",
  "forge",
  "worktree",
  "verification",
  "review",
  "ci",
  "ready",
  "merge",
  "cleanup"
]);
var KNOWN_REPOSITORY_KEYS = /* @__PURE__ */ new Set(["remote", "defaultBranch"]);
var KNOWN_FORGE_KEYS = /* @__PURE__ */ new Set([
  "driver",
  "issueRequired",
  "draftAfterFirstCommit",
  "issueClosingSyntax"
]);
var KNOWN_WORKTREE_KEYS = /* @__PURE__ */ new Set(["root", "branchTemplate", "bootstrap"]);
var KNOWN_VERIFICATION_KEYS = /* @__PURE__ */ new Set([
  "commands",
  "requireCleanDiffAfter",
  "invalidateOnHeadChange"
]);
var KNOWN_REVIEW_KEYS = /* @__PURE__ */ new Set(["agent", "required", "invalidateOnHeadChange"]);
var KNOWN_CI_KEYS = /* @__PURE__ */ new Set(["driver", "requiredChecks", "wait", "flakyRetry"]);
var KNOWN_READY_KEYS = /* @__PURE__ */ new Set(["requires", "stopAfterReady"]);
var KNOWN_MERGE_KEYS = /* @__PURE__ */ new Set(["strategy", "policy", "requireFreshGates"]);
var KNOWN_CLEANUP_KEYS = /* @__PURE__ */ new Set(["when", "requires"]);
function issuesFor(prefix, allowed, value) {
  const issues = [];
  for (const k of Object.keys(value)) {
    if (!allowed.has(k)) issues.push(`${prefix}.${k} is not a recognised field`);
  }
  return issues;
}
function isStringArrayOfArrays(v) {
  return Array.isArray(v) && v.every((row) => Array.isArray(row) && row.every((s) => typeof s === "string"));
}
function isStringArray(v) {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}
function validateAdapter(value) {
  const issues = [];
  if (!value || typeof value !== "object") {
    return { ok: false, issues: ["root must be an object"] };
  }
  const obj = value;
  for (const k of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(k)) issues.push(`root.${k} is not a recognised field`);
  }
  if (obj.contractVersion !== 1) issues.push("contractVersion must be the literal 1");
  if (obj.repository !== void 0) {
    const r = obj.repository;
    issues.push(...issuesFor("repository", KNOWN_REPOSITORY_KEYS, r));
    if (r.defaultBranch !== void 0) {
      const db = r.defaultBranch;
      if (db.discover !== void 0 && typeof db.discover !== "boolean")
        issues.push("repository.defaultBranch.discover must be boolean");
      if (db.name !== void 0 && typeof db.name !== "string")
        issues.push("repository.defaultBranch.name must be string");
    }
  }
  if (obj.forge !== void 0) {
    const f = obj.forge;
    issues.push(...issuesFor("forge", KNOWN_FORGE_KEYS, f));
    if (f.driver !== void 0 && f.driver !== "github")
      issues.push("forge.driver must be 'github'");
    if (f.issueRequired !== void 0 && typeof f.issueRequired !== "boolean")
      issues.push("forge.issueRequired must be boolean");
    if (f.draftAfterFirstCommit !== void 0 && typeof f.draftAfterFirstCommit !== "boolean")
      issues.push("forge.draftAfterFirstCommit must be boolean");
    if (f.issueClosingSyntax !== void 0 && typeof f.issueClosingSyntax !== "boolean")
      issues.push("forge.issueClosingSyntax must be boolean");
  }
  if (obj.worktree !== void 0) {
    const w = obj.worktree;
    issues.push(...issuesFor("worktree", KNOWN_WORKTREE_KEYS, w));
    if (w.root !== void 0 && typeof w.root !== "string")
      issues.push("worktree.root must be string");
    if (w.branchTemplate !== void 0 && typeof w.branchTemplate !== "string")
      issues.push("worktree.branchTemplate must be string");
    if (w.bootstrap !== void 0 && !isStringArrayOfArrays(w.bootstrap))
      issues.push("worktree.bootstrap must be an array of argv arrays");
  }
  if (obj.verification !== void 0) {
    const v = obj.verification;
    issues.push(...issuesFor("verification", KNOWN_VERIFICATION_KEYS, v));
    if (v.commands !== void 0) {
      if (!Array.isArray(v.commands)) issues.push("verification.commands must be an array");
      else {
        for (let i = 0; i < v.commands.length; i++) {
          const cmd = v.commands[i];
          if (typeof cmd.id !== "string")
            issues.push(`verification.commands[${i}].id must be string`);
          if (!Array.isArray(cmd.argv) || !cmd.argv.every((s) => typeof s === "string"))
            issues.push(`verification.commands[${i}].argv must be string[]`);
          if (cmd.timeoutMs !== void 0 && typeof cmd.timeoutMs !== "number")
            issues.push(`verification.commands[${i}].timeoutMs must be number`);
        }
      }
    }
    if (v.requireCleanDiffAfter !== void 0 && typeof v.requireCleanDiffAfter !== "boolean")
      issues.push("verification.requireCleanDiffAfter must be boolean");
    if (v.invalidateOnHeadChange !== void 0 && typeof v.invalidateOnHeadChange !== "boolean")
      issues.push("verification.invalidateOnHeadChange must be boolean");
  }
  if (obj.review !== void 0) {
    const r = obj.review;
    issues.push(...issuesFor("review", KNOWN_REVIEW_KEYS, r));
    if (r.agent !== void 0 && typeof r.agent !== "string")
      issues.push("review.agent must be string");
    if (r.required !== void 0 && typeof r.required !== "boolean")
      issues.push("review.required must be boolean");
    if (r.invalidateOnHeadChange !== void 0 && typeof r.invalidateOnHeadChange !== "boolean")
      issues.push("review.invalidateOnHeadChange must be boolean");
  }
  if (obj.ci !== void 0) {
    const c = obj.ci;
    issues.push(...issuesFor("ci", KNOWN_CI_KEYS, c));
    if (c.driver !== void 0 && c.driver !== "github-status-checks")
      issues.push("ci.driver must be 'github-status-checks'");
    if (c.requiredChecks !== void 0 && !isStringArray(c.requiredChecks))
      issues.push("ci.requiredChecks must be string[]");
    if (c.wait !== void 0 && typeof c.wait !== "boolean")
      issues.push("ci.wait must be boolean");
    if (c.flakyRetry !== void 0 && c.flakyRetry !== 0 && c.flakyRetry !== 1)
      issues.push("ci.flakyRetry must be 0 or 1");
  }
  if (obj.ready !== void 0) {
    const r = obj.ready;
    issues.push(...issuesFor("ready", KNOWN_READY_KEYS, r));
    if (r.requires !== void 0) {
      const set = /* @__PURE__ */ new Set(["review", "local-verification", "remote-ci"]);
      const arr = r.requires;
      if (!Array.isArray(arr) || !arr.every((x) => typeof x === "string" && set.has(x))) {
        issues.push("ready.requires must be one of review|local-verification|remote-ci");
      }
    }
    if (r.stopAfterReady !== void 0 && typeof r.stopAfterReady !== "boolean")
      issues.push("ready.stopAfterReady must be boolean");
  }
  if (obj.merge !== void 0) {
    const m = obj.merge;
    issues.push(...issuesFor("merge", KNOWN_MERGE_KEYS, m));
    if (m.strategy !== void 0 && m.strategy !== "squash")
      issues.push("merge.strategy must be 'squash'");
    if (m.policy !== void 0 && m.policy !== "explicit-user-request-only")
      issues.push("merge.policy must be 'explicit-user-request-only'");
    if (m.requireFreshGates !== void 0 && typeof m.requireFreshGates !== "boolean")
      issues.push("merge.requireFreshGates must be boolean");
  }
  if (obj.cleanup !== void 0) {
    const c = obj.cleanup;
    issues.push(...issuesFor("cleanup", KNOWN_CLEANUP_KEYS, c));
    if (c.when !== void 0 && c.when !== "next-task")
      issues.push("cleanup.when must be 'next-task'");
    if (c.requires !== void 0) {
      const set = /* @__PURE__ */ new Set(["pr-merged", "worktree-clean", "no-unpublished-commits"]);
      const arr = c.requires;
      if (!Array.isArray(arr) || !arr.every((x) => typeof x === "string" && set.has(x))) {
        issues.push(
          "cleanup.requires must be one of pr-merged|worktree-clean|no-unpublished-commits"
        );
      }
    }
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, adapter: obj };
}
async function loadAdapter(repoRoot) {
  const path = resolve(repoRoot, ".opencode", ADAPTER_FILENAME);
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch {
    return { ok: false, error: { kind: "missing", path } };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: { kind: "parse", path, message: e.message } };
  }
  const v = validateAdapter(parsed);
  if (!v.ok) return { ok: false, error: { kind: "contract", path, issues: v.issues } };
  const sha256 = createHash("sha256").update(raw).digest("hex");
  return { ok: true, adapter: v.adapter, path, sha256 };
}
async function writeLock(repoRoot, adapterSha256) {
  const lockPath = resolve(repoRoot, ".opencode", LOCK_FILENAME);
  await mkdir(dirname(lockPath), { recursive: true });
  const lock = {
    contractVersion: 1,
    adapterSha256,
    writtenAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  const tmp = `${lockPath}.tmp`;
  await writeFile(tmp, JSON.stringify(lock, null, 2) + "\n", "utf8");
  await rename(tmp, lockPath);
  return lockPath;
}
async function readLock(repoRoot) {
  const lockPath = resolve(repoRoot, ".opencode", LOCK_FILENAME);
  try {
    const raw = await readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.contractVersion !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}
function findOpencodeDir(start) {
  let cur = resolve(start);
  while (true) {
    const candidate = join(cur, ".opencode");
    if (existsSync(join(candidate, ADAPTER_FILENAME))) return candidate;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}

// src/state/lifecycle.js
var STATES = [
  "issue-linked",
  "worktree-created",
  "draft-open",
  "validating",
  "ready",
  "merged",
  "cleanup-pending",
  "cleaned",
  "failed",
  "aborted"
];
var TERMINAL = /* @__PURE__ */ new Set(["cleaned", "aborted"]);
var NEXT = {
  "issue-linked": ["issue-linked", "worktree-created", "aborted", "failed"],
  "worktree-created": ["worktree-created", "draft-open", "validating", "aborted", "failed"],
  "draft-open": ["draft-open", "validating", "aborted", "failed"],
  "validating": ["validating", "ready", "draft-open", "aborted", "failed"],
  "ready": ["ready", "merged", "validating", "aborted", "failed"],
  "merged": ["merged", "cleanup-pending", "aborted", "failed"],
  "cleanup-pending": ["cleanup-pending", "cleaned", "aborted", "failed"],
  "cleaned": ["cleaned"],
  "failed": ["failed", "aborted"],
  "aborted": ["aborted"]
};
function transition(m, to, opts) {
  opts = opts ?? {};
  if (!m || typeof m !== "object") {
    return { ok: false, from: void 0, attempted: to, reason: "manifest is missing" };
  }
  if (!STATES.includes(m.state)) {
    return { ok: false, from: m.state, attempted: to, reason: `manifest state ${m.state} is not recognised` };
  }
  if (!STATES.includes(to)) {
    return { ok: false, from: m.state, attempted: to, reason: `target state ${to} is not recognised` };
  }
  const allowed = NEXT[m.state];
  if (!allowed.includes(to)) {
    return { ok: false, from: m.state, attempted: to, reason: `transition from ${m.state} to ${to} is not permitted` };
  }
  const now = (opts.now ?? (() => /* @__PURE__ */ new Date()))();
  const at = now.getTime();
  const entry = { from: m.state, to, at };
  if (opts.reason !== void 0) entry.reason = opts.reason;
  const next = {
    ...m,
    state: to,
    transitionLog: [...m.transitionLog, entry],
    updatedAt: now.toISOString()
  };
  if (to === "failed") {
    next.fatalReason = opts.reason ?? "unspecified";
  }
  return { ok: true, from: m.state, to, at, reason: opts.reason };
}
function createManifest(input) {
  const now = (input.now ?? (() => /* @__PURE__ */ new Date()))();
  return {
    schemaVersion: 1,
    taskId: input.taskId,
    repoIdentity: input.repoIdentity,
    issueNumber: input.issueNumber,
    prNumber: input.prNumber ?? null,
    baseBranch: input.baseBranch,
    baseSha: input.baseSha,
    branch: input.branch,
    worktreePath: input.worktreePath ?? null,
    lastPrHeadSha: input.lastPrHeadSha ?? null,
    lastReviewerSha: input.lastReviewerSha ?? null,
    lastVerifierSha: input.lastVerifierSha ?? null,
    owner: input.owner,
    state: "issue-linked",
    transitionLog: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}
function canTransition(from, to) {
  return NEXT[from]?.includes(to) === true;
}
function isTerminal(s) {
  return TERMINAL.has(s);
}
function mustRerunReview(previousSha, currentSha) {
  return previousSha !== currentSha;
}
function mustRerunVerifier(previousSha, currentSha) {
  return previousSha !== currentSha;
}

// src/state/manifest-store.js
import { readFile as readFile3, readdir as readdir2, unlink as unlink2 } from "node:fs/promises";
import { join as join4, resolve as resolve4 } from "node:path";

// src/state/git-common-dir.js
import { spawn } from "node:child_process";
import { resolve as resolve2, join as join2 } from "node:path";
async function resolveGitCommonDir(repoRoot) {
  if (typeof repoRoot !== "string" || repoRoot.length === 0) {
    throw new Error("resolveGitCommonDir: repoRoot must be a non-empty string");
  }
  return new Promise((resolveP, reject) => {
    const proc = spawn(
      "git",
      ["-C", repoRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { stdio: ["ignore", "pipe", "pipe"], shell: false }
    );
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => {
      out += d.toString("utf8");
    });
    proc.stderr.on("data", (d) => {
      err += d.toString("utf8");
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(
          `git rev-parse --git-common-dir failed (exit ${code}): ${err.trim() || "unknown error"}`
        ));
        return;
      }
      const trimmed = out.trim();
      if (!trimmed) {
        reject(new Error("git rev-parse --git-common-dir returned an empty path"));
        return;
      }
      resolveP(resolve2(repoRoot, trimmed));
    });
  });
}

// src/state/durable-store.js
import {
  open as fsOpen,
  writeFile as writeFile2,
  readFile as readFile2,
  rename as rename2,
  link,
  mkdir as mkdir2,
  readdir,
  unlink,
  stat
} from "node:fs/promises";
import { dirname as dirname2, join as join3, resolve as resolve3 } from "node:path";
import { createHash as createHash2, randomBytes } from "node:crypto";
var STALE_LOCK_MS = 120 * 1e3;
function randomToken() {
  return randomBytes(8).toString("hex");
}
function ensureString(value) {
  return JSON.stringify(value, null, 2) + "\n";
}
async function fsyncDir(path) {
  try {
    const handle = await fsOpen(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
  }
}
async function atomicReplaceJson(path, value) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("atomicReplaceJson: path must be a non-empty string");
  }
  const target = resolve3(path);
  const parent = dirname2(target);
  await mkdir2(parent, { recursive: true });
  const tmp = `${target}.${randomToken()}.tmp`;
  const handle = await fsOpen(tmp, "w", 384);
  try {
    await handle.writeFile(ensureString(value), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename2(tmp, target);
  await fsyncDir(parent);
}

// src/state/manifest-store.js
var SHIP_DIRNAME = "opencode-ship";
var LEGACY_DIRNAME = "opencode-delivery";
function canonicalManifestPath(commonDir, taskId) {
  return join4(commonDir, SHIP_DIRNAME, "delivery", "manifests", `${taskId}.json`);
}
function legacyManifestPath(commonDir, taskId) {
  return join4(commonDir, LEGACY_DIRNAME, "manifests", `${taskId}.json`);
}
async function commonDirFromRepoRoot(repoRoot) {
  return resolveGitCommonDir(repoRoot);
}
async function readJsonOrNull(path) {
  try {
    const raw = await readFile3(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function writeManifest(repoRoot, manifest) {
  const commonDir = await commonDirFromRepoRoot(repoRoot);
  const path = canonicalManifestPath(commonDir, manifest.taskId);
  await atomicReplaceJson(path, manifest);
  return resolve4(path);
}
async function readManifest(repoRoot, taskId) {
  const commonDir = await commonDirFromRepoRoot(repoRoot);
  const canonical = await readJsonOrNull(canonicalManifestPath(commonDir, taskId));
  if (canonical !== null) return canonical;
  const legacy = await readJsonOrNull(legacyManifestPath(commonDir, taskId));
  if (legacy !== null) return legacy;
  return null;
}
async function listManifests(repoRoot) {
  const commonDir = await commonDirFromRepoRoot(repoRoot);
  const canonicalDir = join4(commonDir, SHIP_DIRNAME, "delivery", "manifests");
  const legacyDir = join4(commonDir, LEGACY_DIRNAME, "manifests");
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const dir of [canonicalDir, legacyDir]) {
    let names;
    try {
      names = await readdir2(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      if (seen.has(name)) continue;
      const parsed = await readJsonOrNull(join4(dir, name));
      if (parsed !== null) {
        seen.add(name);
        out.push(parsed);
      }
    }
  }
  return out;
}
async function deleteManifest(repoRoot, taskId) {
  const commonDir = await commonDirFromRepoRoot(repoRoot);
  const canonical = canonicalManifestPath(commonDir, taskId);
  const legacy = legacyManifestPath(commonDir, taskId);
  await unlink2(canonical).catch(() => null);
  await unlink2(legacy).catch(() => null);
}

// src/drivers/git.js
import { spawnSync } from "node:child_process";
import { resolve as resolve5 } from "node:path";
import { existsSync as existsSync2 } from "node:fs";
var WorktreeRecord = {
  path: "",
  branch: "",
  head: ""
};
function runGit(args, cwd) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  });
}
function isInsideWorktree(cwd) {
  const r = runGit(["rev-parse", "--is-inside-work-tree"], cwd);
  return r.status === 0 && r.stdout.trim() === "true";
}
function isMainCheckout(cwd) {
  const common = runGit(["rev-parse", "--git-common-dir"], cwd);
  const dir = runGit(["rev-parse", "--git-dir"], cwd);
  if (common.status !== 0 || dir.status !== 0) return false;
  return common.stdout.trim() === dir.stdout.trim();
}
function listWorktrees(cwd) {
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
function isWorktreeClean(cwd) {
  const r = runGit(["status", "--porcelain"], cwd);
  if (r.status !== 0) return false;
  return r.stdout.trim().length === 0;
}
function isRebaseInProgress(cwd) {
  const merge = runGit(["rev-parse", "--git-path", "rebase-merge"], cwd);
  const apply = runGit(["rev-parse", "--git-path", "rebase-apply"], cwd);
  const mergeExists = merge.status === 0 && safeExists(resolve5(cwd, merge.stdout.trim()));
  const applyExists = apply.status === 0 && safeExists(resolve5(cwd, apply.stdout.trim()));
  return mergeExists || applyExists;
}
function safeExists(p) {
  try {
    return existsSync2(p);
  } catch {
    return false;
  }
}
function currentBranch(cwd) {
  const r = runGit(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (r.status !== 0) return null;
  const out = r.stdout.trim();
  if (out === "HEAD") return null;
  return out;
}
function revParse(ref, cwd) {
  const r = runGit(["rev-parse", "--verify", ref], cwd);
  return r.status === 0 ? r.stdout.trim() : null;
}
function fetchBranch(remote, branch, cwd) {
  const r = runGit(["fetch", remote, branch], cwd);
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}
function remoteExists(remote, cwd) {
  const r = runGit(["remote", "get-url", remote], cwd);
  return r.status === 0;
}
function createWorktree(opts) {
  const args = ["worktree", "add", "-b", opts.branch, opts.worktreePath, opts.base];
  const r = runGit(args, opts.cwd);
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}
function createWorktreeFromLocal(opts) {
  const args = ["worktree", "add", "-b", opts.branch, opts.worktreePath, opts.base];
  const r = runGit(args, opts.cwd);
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}
function worktreeExists(cwd, path) {
  return listWorktrees(cwd).some((w) => w.path === path);
}
function branchExistsLocally(branch, cwd) {
  const r = runGit(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], cwd);
  return r.status === 0;
}
function branchExistsRemotely(remote, branch, cwd) {
  const r = runGit(["ls-remote", "--heads", remote, branch], cwd);
  return r.status === 0 && r.stdout.includes(`refs/heads/${branch}`);
}
function mergeIntoFeature(branch, base, cwd) {
  const r = runGit(["merge", `--into-name=${branch}`, base], cwd);
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}
function currentHead(cwd) {
  const r = runGit(["rev-parse", "HEAD"], cwd);
  return r.status === 0 ? r.stdout.trim() : null;
}
function push(remote, branch, cwd) {
  const r = runGit(["push", remote, branch], cwd);
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}
function pushForceDisabled(_remote, _branch, cwd) {
  return { status: 1, stderr: "force-push is not permitted by the delivery driver" };
}
function defaultBranch(cwd) {
  const r = runGit(["rev-parse", "--abbrev-ref", "HEAD", "@{u}"], cwd);
  if (r.status !== 0) {
    const head = runGit(["symbolic-ref", "--short", "HEAD"], cwd);
    return head.status === 0 ? head.stdout.trim() : null;
  }
  const out = r.stdout.trim();
  const slash = out.indexOf("/");
  return slash >= 0 ? out.slice(slash + 1) : out;
}
function mergeBaseRemoteHead(remote, branch, cwd) {
  const r = runGit(["rev-parse", "--verify", `${remote}/${branch}`], cwd);
  return r.status === 0 ? r.stdout.trim() : null;
}

// src/drivers/gh-cli.js
import { spawn as spawn2 } from "node:child_process";

// src/drivers/github.js
function parseRepoSlug(slug) {
  const slash = slug.indexOf("/");
  if (slash <= 0 || slash === slug.length - 1) return null;
  return { owner: slug.slice(0, slash), name: slug.slice(slash + 1) };
}

// src/drivers/github-command-policy.js
var ALLOWED_VERBS = /* @__PURE__ */ new Set([
  "issue list",
  "issue view",
  "issue create",
  "issue comment",
  "issue edit",
  "issue close",
  "pr list",
  "pr view",
  "pr create",
  "pr edit",
  "pr checks",
  "pr ready",
  "pr merge"
]);
var FORBIDDEN_FLAGS = /* @__PURE__ */ new Set([
  "--web",
  "--body-file",
  "--template"
]);
function validateGhArgv(argv) {
  if (!Array.isArray(argv) || argv.length < 2) {
    return { ok: false, reason: "argv must be a non-empty array starting with the binary" };
  }
  const [bin, ...rest] = argv;
  if (bin !== "gh") {
    return { ok: false, reason: `expected 'gh' binary, got ${JSON.stringify(bin)}` };
  }
  if (rest.length === 0) {
    return { ok: false, reason: "no gh subcommand" };
  }
  const verb = rest.slice(0, 2).join(" ");
  if (verb.includes("api")) {
    return { ok: false, reason: "gh api is not allowed (use typed Ship tools instead)" };
  }
  if (!ALLOWED_VERBS.has(verb)) {
    return { ok: false, reason: `gh subcommand not in the allowlist: ${verb}` };
  }
  for (const arg of rest.slice(2)) {
    if (FORBIDDEN_FLAGS.has(arg)) {
      return { ok: false, reason: `gh flag ${arg} is forbidden (use Ship's typed body argument instead)` };
    }
    if (typeof arg !== "string" || arg.length === 0) {
      return { ok: false, reason: "gh argv must contain only non-empty strings" };
    }
  }
  return { ok: true, verb: (
    /** @type {any} */
    verb
  ) };
}

// src/drivers/gh-cli.js
function defaultRunner(cwd, env) {
  return (args) => new Promise((resolve9, reject) => {
    const proc = spawn2("gh", args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => stdout += d.toString());
    proc.stderr.on("data", (d) => stderr += d.toString());
    proc.on("error", reject);
    proc.on("close", (status) => resolve9({ status: status ?? -1, stdout, stderr }));
  });
}
function viewFields() {
  return [
    "number",
    "url",
    "baseRefName",
    "headRefName",
    "headRefOid",
    "isDraft",
    "mergeable",
    "mergeStateStatus",
    "state",
    "mergedAt"
  ].join(",");
}
function pullRequestSummaryFromView(fields) {
  const merged = fields.state === "MERGED" || fields.merged === true || typeof fields.mergedAt === "string" && fields.mergedAt.length > 0;
  return {
    number: fields.number,
    url: fields.url,
    baseRefName: fields.baseRefName,
    headRefName: fields.headRefName,
    headSha: fields.headRefOid,
    draft: Boolean(fields.isDraft),
    mergeable: fields.mergeable ?? "UNKNOWN",
    mergeStateStatus: fields.mergeStateStatus ?? "UNKNOWN",
    state: fields.state ?? "UNKNOWN",
    merged: Boolean(merged),
    mergedAt: fields.mergedAt ?? null
  };
}
async function ghJson(run, args) {
  const r = await run(args);
  if (r.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed: ${r.stderr.trim() || "(no stderr)"}`);
  }
  if (!r.stdout.trim()) {
    throw new Error(`gh ${args.join(" ")} returned empty stdout`);
  }
  return JSON.parse(r.stdout);
}
function createGhDriver(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const env = opts.env ?? process.env;
  const run = opts.runner ?? defaultRunner(cwd, env);
  return {
    async ensureIssue({ repo, title, body, labels }) {
      const repoSlug = parseRepoSlug(repo);
      if (!repoSlug) throw new Error(`ensureIssue: invalid repo slug ${repo}`);
      const list = await run([
        "issue",
        "list",
        "--repo",
        repo,
        "--search",
        title,
        "--state",
        "open",
        "--json",
        "number,title,state,url",
        "--limit",
        "20"
      ]);
      if (list.status === 0 && list.stdout.trim()) {
        const issues = JSON.parse(list.stdout);
        const exact = issues.find(
          (i) => i.title?.trim() === title.trim() && i.state === "OPEN"
        );
        if (exact) {
          return {
            summary: {
              number: exact.number,
              url: exact.url,
              state: "OPEN",
              pullRequest: null
            },
            created: false
          };
        }
      }
      const createArgs = ["issue", "create", "--repo", repo, "--title", title, "--body", body];
      for (const label of labels ?? []) {
        createArgs.push("--label", label);
      }
      const created = await run(createArgs);
      if (created.status !== 0) {
        throw new Error(`gh issue create failed: ${created.stderr.trim() || "(no stderr)"}`);
      }
      const url = (created.stdout.trim().split("\n").pop() ?? "").trim();
      const m = url.match(/\/issues\/(\d+)/);
      const number = m && m[1] ? parseInt(m[1], 10) : -1;
      return {
        summary: { number, url, state: "OPEN", pullRequest: null },
        created: true
      };
    },
    async openDraftPullRequest({ repo, head, base, title, body, issueNumber }) {
      if (!parseRepoSlug(repo)) throw new Error(`openDraftPullRequest: invalid repo slug ${repo}`);
      if (typeof issueNumber !== "number") throw new Error("openDraftPullRequest: issueNumber is required");
      const issueBody = body.includes(`Closes #${issueNumber}`) ? body : `${body}

Closes #${issueNumber}`;
      const args = [
        "pr",
        "create",
        "--repo",
        repo,
        "--draft",
        "--base",
        base,
        "--head",
        head,
        "--title",
        title,
        "--body",
        issueBody
      ];
      const r = await run(args);
      if (r.status !== 0) {
        throw new Error(`gh pr create failed: ${r.stderr.trim() || "(no stderr)"}`);
      }
      const url = (r.stdout.trim().split("\n").pop() ?? "").trim();
      const m = url.match(/\/pull\/(\d+)/);
      const number = m && m[1] ? parseInt(m[1], 10) : -1;
      const fields = await ghJson(run, [
        "pr",
        "view",
        String(number),
        "--repo",
        repo,
        "--json",
        viewFields()
      ]);
      return pullRequestSummaryFromView(fields);
    },
    async updatePullRequestBody({ repo, number, body }) {
      if (typeof number !== "number") throw new Error("updatePullRequestBody: number is required");
      const r = await run(["pr", "edit", String(number), "--repo", repo, "--body", body]);
      if (r.status !== 0) throw new Error(`gh pr edit failed: ${r.stderr.trim() || "(no stderr)"}`);
    },
    async markReady({ repo, number }) {
      if (typeof number !== "number") throw new Error("markReady: number is required");
      const r = await run(["pr", "ready", String(number), "--repo", repo]);
      if (r.status !== 0) throw new Error(`gh pr ready failed: ${r.stderr.trim() || "(no stderr)"}`);
    },
    async mergePullRequest({ repo, number, subject }) {
      if (typeof number !== "number") throw new Error("mergePullRequest: number is required");
      const args = [
        "pr",
        "merge",
        String(number),
        "--repo",
        repo,
        "--squash",
        "--subject",
        subject
      ];
      const r = await run(args);
      if (r.status !== 0) {
        throw new Error(`gh pr merge failed: ${r.stderr.trim() || "(no stderr)"}`);
      }
      const fields = await ghJson(run, [
        "pr",
        "view",
        String(number),
        "--repo",
        repo,
        "--json",
        viewFields()
      ]);
      return pullRequestSummaryFromView(fields);
    },
    async readPullRequest({ repo, number }) {
      if (typeof number !== "number") throw new Error("readPullRequest: number is required");
      const fields = await ghJson(run, [
        "pr",
        "view",
        String(number),
        "--repo",
        repo,
        "--json",
        viewFields()
      ]);
      return pullRequestSummaryFromView(fields);
    },
    async readChecks({ repo, sha, number, branch, required }) {
      const target = typeof number === "number" && Number.isFinite(number) ? String(number) : typeof branch === "string" && branch.length > 0 ? branch : typeof sha === "string" && sha.length > 0 ? String(sha) : null;
      if (target === null) {
        throw new Error("readChecks requires either a number, branch, or sha");
      }
      const r = await run([
        "pr",
        "checks",
        target,
        "--repo",
        repo,
        "--json",
        "name,state,bucket"
      ]);
      if (r.status !== 0) {
        if (/no checks reported/i.test(r.stderr ?? "")) {
          return [];
        }
        throw new Error(`gh pr checks failed: ${r.stderr.trim() || "(no stderr)"}`);
      }
      const all = r.stdout.trim() ? JSON.parse(r.stdout) : [];
      const out = [];
      for (const requiredName of required ?? []) {
        const match = all.find((c) => c.name === requiredName);
        if (!match) {
          out.push({ name: requiredName, state: "pending", bucket: "pending" });
          continue;
        }
        out.push({ name: match.name, state: match.state, bucket: match.bucket });
      }
      return out;
    },
    async comment({ repo, number, body }) {
      if (typeof number !== "number") throw new Error("comment: number is required");
      const r = await run(["issue", "comment", String(number), "--repo", repo, "--body", body]);
      if (r.status !== 0) throw new Error(`gh issue comment failed: ${r.stderr.trim() || "(no stderr)"}`);
    },
    async refreshHead({ repo, number }) {
      if (typeof number !== "number") throw new Error("refreshHead: number is required");
      const fields = await ghJson(run, [
        "pr",
        "view",
        String(number),
        "--repo",
        repo,
        "--json",
        "headRefOid"
      ]);
      return fields.headRefOid;
    },
    async runCommand(argv) {
      if (!Array.isArray(argv) || argv.length === 0) {
        throw new Error("runCommand: argv must be a non-empty array");
      }
      if (typeof argv[0] !== "string" || argv[0].length === 0) {
        throw new Error("runCommand: argv[0] must be a non-empty string");
      }
      const policy = validateGhArgv(argv);
      if (!policy.ok) {
        throw new Error(`runCommand: rejected by policy: ${policy.reason}`);
      }
      const r = await run(argv);
      return r;
    }
  };
}
function createGhStub(responses) {
  const queue = responses.map((r) => ({ ...r }));
  const runner = async (args) => {
    const head = args[0] ?? "";
    const idx = queue.findIndex((entry) => entry.match(args));
    if (idx === -1) {
      return {
        status: 1,
        stdout: "",
        stderr: `gh stub: no response queued for ${head}`
      };
    }
    const next = queue[idx];
    queue.splice(idx, 1);
    return { status: next.status ?? 0, stdout: next.stdout ?? "", stderr: next.stderr ?? "" };
  };
  return { driver: createGhDriver({ runner }), queue };
}

// src/recovery.js
async function scanRecovery(repoRoot) {
  const manifests = await listManifests(repoRoot);
  const report = {
    total: manifests.length,
    pendingCleanup: 0,
    orphanWorktrees: 0,
    cleaned: 0,
    notes: []
  };
  for (const m of manifests) {
    if (m.state === "cleanup-pending") report.pendingCleanup += 1;
    if (m.state === "cleaned") report.cleaned += 1;
  }
  for (const wt of listWorktrees(repoRoot)) {
    const note = `worktree ${wt.path} branch=${wt.branch} head=${wt.head}`;
    if (!manifests.some((m) => m.worktreePath === wt.path)) {
      report.orphanWorktrees += 1;
      report.notes.push(`orphan ${note}`);
    }
  }
  return report;
}
async function removeManifestIfSafe(repoRoot, taskId) {
  const m = await readManifest(repoRoot, taskId);
  if (!m) return false;
  if (m.state !== "cleaned") return false;
  await deleteManifest(repoRoot, taskId);
  return true;
}
function wouldCleanupBeSafe(args) {
  return Boolean(
    args.prMerged && args.worktreeClean && !args.rebaseInProgress && args.headMatchesPr && args.baseMatches
  );
}
function recoverManifestAfterCrash(manifest) {
  return manifest;
}

// src/doctor.js
import { spawnSync as spawnSync2 } from "node:child_process";
import { resolve as resolve6 } from "node:path";
function runVersion(argv) {
  const r = spawnSync2(argv[0], argv.slice(1), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}
async function doctor(repoRoot, packageVersion) {
  const adapter = await loadAdapter(repoRoot);
  const lock = await readLock(repoRoot);
  const checks = [];
  checks.push({
    name: "node>=20",
    ok: /^v(2[0-9]|[3-9]\d)/.test(process.version),
    detail: process.version
  });
  const git = runVersion(["git", "--version"]);
  checks.push({
    name: "git installed",
    ok: git !== null,
    detail: git ?? "git not on PATH"
  });
  const gh = runVersion(["gh", "--version"]);
  checks.push({
    name: "gh installed",
    ok: gh !== null,
    detail: gh ?? "gh CLI not on PATH"
  });
  checks.push({
    name: `adapter contract v${ADAPTER_CONTRACT_VERSION}`,
    ok: adapter.ok,
    detail: adapter.ok ? `loaded from ${adapter.path}` : adapter.error.kind
  });
  if (adapter.ok && lock) {
    checks.push({
      name: "lock sha matches adapter",
      ok: lock.adapterSha256 === adapter.sha256,
      detail: lock.adapterSha256 === adapter.sha256 ? "match" : "drift"
    });
  }
  checks.push({
    name: "package version pinned",
    ok: packageVersion !== null,
    detail: packageVersion ?? "missing"
  });
  return {
    contractVersion: 1,
    adapterPath: adapter.ok ? adapter.path : null,
    adapterSha256: adapter.ok ? adapter.sha256 : null,
    lockPath: lock ? resolve6(repoRoot, ".opencode", "delivery.lock.json") : null,
    lockSha256: lock ? lock.adapterSha256 : null,
    packageVersion,
    nodeVersion: process.version,
    ghVersion: gh,
    gitVersion: git,
    checks
  };
}

// src/gates.js
var CHECK_BUCKETS = /* @__PURE__ */ new Map([
  ["pass", "pass"],
  ["fail", "fail"],
  ["pending", "pending"],
  ["skip", "skip"],
  ["neutral", "neutral"]
]);
function bucketFor(check) {
  if (!check) return "pending";
  if (CHECK_BUCKETS.has(check.bucket)) return check.bucket;
  if (check.state === "success") return "pass";
  if (check.state === "failure") return "fail";
  return "pending";
}
function gateSnapshot({ manifest, prHead, checks }) {
  const required = manifest.adapter?.ci?.requiredChecks ?? [];
  const observed = checks ?? [];
  const missing = [];
  const failing = [];
  const pending = [];
  for (const name of required) {
    const match = observed.find((c) => c.name === name);
    if (!match) {
      missing.push(name);
      pending.push(name);
      continue;
    }
    const bucket = bucketFor(match);
    if (bucket === "fail") failing.push(name);
    else if (bucket === "pending") pending.push(name);
  }
  return {
    prHead: prHead ?? null,
    reviewerSha: manifest?.lastReviewerSha ?? null,
    verifierSha: manifest?.lastVerifierSha ?? null,
    checks: observed,
    missingChecks: missing,
    failingChecks: failing,
    pendingChecks: pending
  };
}
function checkGates({ manifest, prHead, checks, requires }) {
  const snap = gateSnapshot({ manifest, prHead, checks });
  const need = new Set(requires ?? ["review", "local-verification", "remote-ci"]);
  if (need.has("review")) {
    if (!manifest?.lastReviewerSha) return { ok: false, reason: "missing-review", snapshot: snap };
    if (manifest.lastReviewerSha !== prHead) {
      return { ok: false, reason: "head-changed-after-review", snapshot: snap };
    }
  }
  if (need.has("local-verification")) {
    if (!manifest?.lastVerifierSha) return { ok: false, reason: "missing-verifier", snapshot: snap };
    if (manifest.lastVerifierSha !== prHead) {
      return { ok: false, reason: "head-changed-after-verifier", snapshot: snap };
    }
  }
  if (need.has("remote-ci")) {
    if (snap.missingChecks.length > 0) {
      return { ok: false, reason: "ci-missing", snapshot: snap };
    }
    if (snap.failingChecks.length > 0) {
      return { ok: false, reason: "ci-failing", snapshot: snap };
    }
    if (snap.pendingChecks.length > 0) {
      return { ok: false, reason: "ci-pending", snapshot: snap };
    }
  }
  return { ok: true, snapshot: snap };
}
function gateFailureEnvelope(result) {
  switch (result.reason) {
    case "missing-review":
      return { kind: "missing-gate", gate: "review" };
    case "missing-verifier":
      return { kind: "missing-gate", gate: "local-verification" };
    case "head-changed-after-review":
      return {
        kind: "head-changed-after-review",
        headSha: result.snapshot.prHead ?? "",
        reviewSha: result.snapshot.reviewerSha ?? ""
      };
    case "head-changed-after-verifier":
      return {
        kind: "head-changed-after-verifier",
        headSha: result.snapshot.prHead ?? "",
        verifierSha: result.snapshot.verifierSha ?? ""
      };
    case "ci-missing":
      return { kind: "ci-missing", missing: result.snapshot.missingChecks };
    case "ci-failing":
      return { kind: "ci-failing", failing: result.snapshot.failingChecks };
    case "ci-pending":
      return { kind: "ci-pending", pending: result.snapshot.pendingChecks };
    default:
      return { kind: "gate-failed", reason: result.reason };
  }
}

// src/tools/delivery-inspect.js
function createInspectTool(deps) {
  return async function inspect(input) {
    const manifest = await readManifest(deps.repoRoot, input.taskId);
    const doc = await doctor(deps.repoRoot, deps.packageVersion);
    return {
      contractVersion: 1,
      manifest: manifest ?? null,
      doctor: doc
    };
  };
}

// src/tools/delivery-issue.js
function createIssueTool(deps) {
  return async function issue(input) {
    if (!input.taskId) return { kind: "missing-input", field: "taskId" };
    if (!input.title) return { kind: "missing-input", field: "title" };
    if (!input.baseBranch) return { kind: "missing-input", field: "baseBranch" };
    if (!input.branch) return { kind: "missing-input", field: "branch" };
    const existing = await readManifest(deps.repoRoot, input.taskId);
    if (existing) {
      return {
        contractVersion: 1,
        created: false,
        issueNumber: existing.issueNumber,
        issueUrl: `https://github.com/${deps.repoSlug}/issues/${existing.issueNumber}`,
        manifestPath: "preserved",
        preserved: true
      };
    }
    const ensured = await deps.driver.ensureIssue({
      repo: deps.repoSlug,
      title: input.title,
      body: input.body ?? "",
      labels: input.labels ?? []
    });
    const m = createManifest({
      taskId: input.taskId,
      repoIdentity: deps.repoSlug,
      issueNumber: ensured.summary.number,
      baseBranch: input.baseBranch,
      baseSha: input.baseSha ?? "0000000000000000000000000000000000000000",
      branch: input.branch,
      owner: deps.owner,
      prNumber: null,
      lastPrHeadSha: null,
      lastReviewerSha: null,
      lastVerifierSha: null
    });
    const t = transition(m, "issue-linked", {
      reason: ensured.created ? "issue just created" : "issue reused"
    });
    if (!t.ok) {
      return { kind: "lifecycle", reason: t.reason };
    }
    const next = {
      ...m,
      state: t.to,
      transitionLog: [
        ...m.transitionLog,
        { from: t.from, to: t.to, at: t.at, reason: t.reason }
      ],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const path = await writeManifest(deps.repoRoot, next);
    return {
      contractVersion: 1,
      created: ensured.created,
      issueNumber: ensured.summary.number,
      issueUrl: ensured.summary.url,
      manifestPath: path
    };
  };
}

// src/tools/delivery-worktree.js
import { resolve as resolve7 } from "node:path";
import { spawn as spawn3 } from "node:child_process";
function runBootstrap(args, cwd) {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn3(args[0], args.slice(1), {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
    let stderr = "";
    proc.stderr.on("data", (d) => stderr += d.toString());
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
function isPathContained(repoRoot, worktreeRoot, candidatePath) {
  const rootAbs = resolve7(repoRoot, worktreeRoot);
  const normalized = resolve7(candidatePath);
  if (normalized !== rootAbs && !normalized.startsWith(rootAbs + "/")) {
    return false;
  }
  return true;
}
async function markBootstrapFailed(repoRoot, manifest, error, argv) {
  const failed = {
    ...manifest,
    state: "cleanup-pending",
    fatalReason: `bootstrap failed: ${error.message}`,
    transitionLog: [
      ...manifest.transitionLog,
      {
        from: manifest.state,
        to: "cleanup-pending",
        at: Date.now(),
        reason: `bootstrap failed: ${error.message}`
      }
    ],
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await writeManifest(repoRoot, failed);
}
function createWorktreeTool(deps) {
  return async function worktree(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
    if (m.state !== "issue-linked" && m.state !== "worktree-created") {
      return { kind: "manifest-state", state: m.state };
    }
    if (!input.branch) return { kind: "missing-input", field: "branch" };
    if (!input.worktreeRelativePath) {
      return { kind: "missing-input", field: "worktreeRelativePath" };
    }
    const worktreeRoot = deps.adapter?.worktree?.root ?? ".worktrees";
    const worktreePath = resolve7(deps.repoRoot, input.worktreeRelativePath);
    if (!isPathContained(deps.repoRoot, worktreeRoot, worktreePath)) {
      return {
        kind: "path-escape",
        resolvedPath: worktreePath,
        expectedRoot: resolve7(deps.repoRoot, worktreeRoot)
      };
    }
    const remote = deps.remote ?? "origin";
    const hasRemote = remoteExists(remote, deps.repoRoot);
    if (hasRemote) {
      const fetched = fetchBranch(remote, m.baseBranch, deps.repoRoot);
      if (fetched.status !== 0) {
        return { kind: "remote-fetch", stderr: fetched.stderr };
      }
    }
    if (branchExistsLocally(input.branch, deps.repoRoot)) {
      return { kind: "branch-exists-locally", branch: input.branch };
    }
    if (branchExistsRemotely(remote, input.branch, deps.repoRoot)) {
      return { kind: "branch-exists-remotely", branch: input.branch };
    }
    if (worktreeExists(deps.repoRoot, worktreePath)) {
      return { kind: "worktree-exists" };
    }
    const baseRef = hasRemote ? `${remote}/${m.baseBranch}` : m.baseBranch;
    const created = createWorktree({
      cwd: deps.repoRoot,
      branch: input.branch,
      worktreePath,
      base: baseRef
    });
    if (created.status !== 0) {
      return { kind: "create-failed", stderr: created.stderr };
    }
    const head = currentHead(worktreePath);
    if (!head) {
      return { kind: "create-failed", stderr: "no HEAD after worktree create" };
    }
    const bootstrap = deps.adapter?.worktree?.bootstrap ?? [];
    for (const argv of bootstrap) {
      if (!Array.isArray(argv) || argv.length === 0) {
        return { kind: "bootstrap-invalid", bootstrap };
      }
      try {
        await runBootstrap(argv, worktreePath);
      } catch (e) {
        await markBootstrapFailed(
          deps.repoRoot,
          {
            ...m,
            worktreePath,
            branch: input.branch,
            baseSha: m.baseSha
          },
          e,
          argv
        );
        return { kind: "bootstrap-failed", stderr: e.message, argv };
      }
    }
    const baseSha = mergeBaseRemoteHead(remote, m.baseBranch, deps.repoRoot) ?? m.baseSha ?? null;
    if (!baseSha) return { kind: "missing-base-sha" };
    const t = transition(
      { ...m, worktreePath, branch: input.branch, baseSha },
      "worktree-created",
      { reason: "worktree created" }
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
        { from: t.from, to: t.to, at: t.at, reason: t.reason }
      ],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const path = await writeManifest(deps.repoRoot, next);
    return {
      contractVersion: 1,
      branch: input.branch,
      worktreePath,
      headSha: head,
      manifestPath: path
    };
  };
}

// src/tools/delivery-verify.js
import { spawn as spawn4 } from "node:child_process";
function runCommand(argv, cwd, timeoutMs) {
  return new Promise((resolveP, rejectP) => {
    const proc = spawn4(argv[0], argv.slice(1), {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
    }, timeoutMs);
    proc.stdout.on("data", (d) => stdoutChunks.push(d.toString()));
    proc.stderr.on("data", (d) => stderrChunks.push(d.toString()));
    proc.on("error", (err) => {
      clearTimeout(timer);
      rejectP(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolveP({
        status: killed ? -1 : code ?? -1,
        stdout: stdoutChunks.join(""),
        stderr: stderrChunks.join("")
      });
    });
  });
}
function createVerifyTool(deps) {
  return async function verify(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
    const commands = deps.adapter?.verification?.commands ?? [];
    if (commands.length === 0) return { kind: "no-commands" };
    const cmd = input.commandId ? commands.find((c) => c.id === input.commandId) : commands[0];
    if (!cmd) return { kind: "command-not-found", commandId: input.commandId ?? commands[0]?.id };
    if (!m.worktreePath) {
      return { kind: "manifest-state", state: m.state, reason: "no worktree" };
    }
    if (m.state !== "worktree-created" && m.state !== "draft-open" && m.state !== "validating" && m.state !== "ready") {
      return { kind: "manifest-state", state: m.state };
    }
    if (deps.adapter?.verification?.requireCleanDiffAfter) {
      if (!isWorktreeClean(m.worktreePath)) {
        return { kind: "worktree-dirty" };
      }
    }
    const head = currentHead(m.worktreePath);
    if (!head) return { kind: "no-head" };
    const timeoutMs = cmd.timeoutMs ?? 18e5;
    const result = await runCommand(cmd.argv, m.worktreePath, timeoutMs);
    const stdoutTail = result.stdout.slice(-2e3);
    const stderrTail = result.stderr.slice(-2e3);
    if (result.status !== 0) {
      return {
        kind: "verify-failed",
        commandId: cmd.id,
        status: result.status,
        stdoutTail,
        stderrTail,
        headSha: head
      };
    }
    const t = transition(
      { ...m, lastVerifierSha: head },
      "validating",
      { reason: `verify ok (${cmd.id})` }
    );
    if (!t.ok) return { kind: "lifecycle", reason: t.reason };
    const next = {
      ...m,
      lastVerifierSha: head,
      state: t.to,
      transitionLog: [
        ...m.transitionLog,
        { from: t.from, to: t.to, at: t.at, reason: t.reason }
      ],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const manifestPath = await writeManifest(deps.repoRoot, next);
    return {
      contractVersion: 1,
      commandId: cmd.id,
      status: 0,
      stdoutTail,
      stderrTail,
      headSha: head,
      manifestPath
    };
  };
}

// src/tools/delivery-review.js
function createReviewTool(deps) {
  return async function review(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
    if (m.prNumber === null) return { kind: "missing-pr" };
    if (m.state !== "worktree-created" && m.state !== "draft-open" && m.state !== "validating" && m.state !== "ready") {
      return { kind: "manifest-state", state: m.state };
    }
    const prHead = await deps.driver.refreshHead({
      repo: deps.repoSlug,
      number: m.prNumber
    });
    if (input.status !== "pass") {
      return {
        kind: "review-not-pass",
        status: input.status,
        headSha: prHead,
        recordedReviewerSha: m.lastReviewerSha ?? null
      };
    }
    if (!input.headSha) {
      return {
        kind: "missing-head-sha",
        prHeadSha: prHead
      };
    }
    if (input.headSha !== prHead) {
      return {
        kind: "head-mismatch",
        reviewSha: input.headSha,
        prHeadSha: prHead
      };
    }
    const next = {
      ...m,
      lastReviewerSha: prHead,
      transitionLog: [
        ...m.transitionLog,
        {
          from: m.state,
          to: m.state,
          at: Date.now(),
          reason: `reviewer pass at ${prHead.slice(0, 7)}`
        }
      ],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const path = await writeManifest(deps.repoRoot, next);
    return {
      contractVersion: 1,
      pr: m.prNumber,
      reviewerSha: prHead,
      manifestPath: path
    };
  };
}

// src/tools/delivery-pr.js
function preserveClosingReference(existingBody, issueNumber) {
  if (!existingBody) return null;
  const match = existingBody.match(/Closes\s+#(\d+)/i);
  if (match) {
    if (match[1] === String(issueNumber)) return existingBody;
    return existingBody.replace(/Closes\s+#\d+/i, `Closes #${issueNumber}`);
  }
  return `${existingBody}

Closes #${issueNumber}`;
}
function createPrTool(deps) {
  return async function pr(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
    if (m.state !== "worktree-created" && m.state !== "draft-open") {
      return { kind: "manifest-state", state: m.state };
    }
    if (m.prNumber === null) {
      const opened = await deps.driver.openDraftPullRequest({
        repo: deps.repoSlug,
        head: m.branch,
        base: m.baseBranch,
        title: input.title,
        body: input.body,
        issueNumber: m.issueNumber
      });
      const t = transition(m, "draft-open", { reason: "draft opened" });
      if (!t.ok) return { kind: "lifecycle", reason: t.reason };
      const next2 = {
        ...m,
        prNumber: opened.number,
        lastPrHeadSha: opened.headSha,
        state: t.to,
        transitionLog: [
          ...m.transitionLog,
          { from: t.from, to: t.to, at: t.at, reason: t.reason }
        ],
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const path2 = await writeManifest(deps.repoRoot, next2);
      return { contractVersion: 1, pr: opened, manifestPath: path2 };
    }
    const existingPr = await deps.driver.readPullRequest({
      repo: deps.repoSlug,
      number: m.prNumber
    });
    const mergedBody = preserveClosingReference(
      input.body,
      m.issueNumber
    ) ?? input.body;
    await deps.driver.updatePullRequestBody({
      repo: deps.repoSlug,
      number: m.prNumber,
      body: mergedBody
    });
    const refreshed = typeof existingPr?.headSha === "string" && existingPr.headSha ? existingPr.headSha : await deps.driver.refreshHead({ repo: deps.repoSlug, number: m.prNumber });
    const next = {
      ...m,
      lastPrHeadSha: refreshed,
      transitionLog: [
        ...m.transitionLog,
        {
          from: m.state,
          to: m.state,
          at: Date.now(),
          reason: `pr body updated (head ${refreshed.slice(0, 7)})`
        }
      ],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const path = await writeManifest(deps.repoRoot, next);
    return {
      contractVersion: 1,
      pr: {
        number: m.prNumber,
        url: existingPr?.url ?? "",
        baseRefName: existingPr?.baseRefName ?? m.baseBranch,
        headRefName: existingPr?.headRefName ?? m.branch,
        headSha: refreshed,
        draft: existingPr?.draft ?? true,
        mergeable: existingPr?.mergeable ?? "UNKNOWN",
        mergeStateStatus: existingPr?.mergeStateStatus ?? "UNKNOWN",
        merged: existingPr?.merged ?? false,
        mergedAt: existingPr?.mergedAt ?? null
      },
      manifestPath: path
    };
  };
}

// src/tools/delivery-ready.js
function createReadyTool(deps) {
  return async function ready(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
    if (m.prNumber === null) return { kind: "missing-pr" };
    const prHead = await deps.driver.refreshHead({
      repo: deps.repoSlug,
      number: m.prNumber
    });
    const required = deps.adapter?.ready?.requires ?? [
      "review",
      "local-verification",
      "remote-ci"
    ];
    const ciDriverAvailable = Boolean(deps.adapter?.ci?.driver);
    const checks = ciDriverAvailable ? await deps.driver.readChecks({
      repo: deps.repoSlug,
      number: m.prNumber,
      branch: m.branch,
      required: deps.adapter?.ci?.requiredChecks ?? []
    }) : [];
    const result = checkGates({
      manifest: { ...m, adapter: deps.adapter },
      prHead,
      checks,
      requires: required
    });
    if (!result.ok) {
      return gateFailureEnvelope(result);
    }
    await deps.driver.markReady({
      repo: deps.repoSlug,
      number: m.prNumber
    });
    const t = transition(m, "ready", { reason: "all gates fresh" });
    if (!t.ok) return { kind: "lifecycle", reason: t.reason };
    const next = {
      ...m,
      lastPrHeadSha: prHead,
      state: t.to,
      transitionLog: [
        ...m.transitionLog,
        { from: t.from, to: t.to, at: t.at, reason: t.reason }
      ],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const path = await writeManifest(deps.repoRoot, next);
    return { contractVersion: 1, manifestPath: path, pr: m.prNumber };
  };
}

// src/tools/delivery-merge.js
function createMergeTool(deps) {
  return async function merge(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
    if (m.prNumber === null) return { kind: "missing-pr" };
    if (m.state !== "ready") {
      return { kind: "not-ready", state: m.state };
    }
    const pr = await deps.driver.readPullRequest({
      repo: deps.repoSlug,
      number: m.prNumber
    });
    if (pr.baseRefName !== m.baseBranch) {
      return { kind: "wrong-base", base: pr.baseRefName };
    }
    const freshGates = deps.adapter?.merge?.requireFreshGates !== false;
    if (freshGates) {
      const required = deps.adapter?.ready?.requires ?? [
        "review",
        "local-verification",
        "remote-ci"
      ];
      const ciDriverAvailable = Boolean(deps.adapter?.ci?.driver);
      const checks = ciDriverAvailable ? await deps.driver.readChecks({
        repo: deps.repoSlug,
        number: m.prNumber,
        branch: m.branch,
        required: deps.adapter?.ci?.requiredChecks ?? []
      }) : [];
      const result = checkGates({
        manifest: { ...m, adapter: deps.adapter },
        prHead: pr.headSha,
        checks,
        requires: required
      });
      if (!result.ok) return gateFailureEnvelope(result);
    }
    if (pr.headSha !== (m.lastPrHeadSha ?? pr.headSha)) {
      return {
        kind: "head-changed",
        headSha: pr.headSha,
        manifestSha: m.lastPrHeadSha ?? ""
      };
    }
    if (pr.draft) return { kind: "not-mergeable", reason: "PR is still draft" };
    if (pr.mergeable !== "MERGEABLE") {
      return { kind: "not-mergeable", reason: `mergeable=${pr.mergeable}` };
    }
    const merged = await deps.driver.mergePullRequest({
      repo: deps.repoSlug,
      number: m.prNumber,
      subject: input.subject
    });
    const t = transition(
      { ...m, lastPrHeadSha: merged.headSha },
      "merged",
      { reason: `squash merged as ${input.subject}` }
    );
    if (!t.ok) return { kind: "lifecycle", reason: t.reason };
    const next = {
      ...m,
      lastPrHeadSha: merged.headSha,
      state: t.to,
      transitionLog: [
        ...m.transitionLog,
        { from: t.from, to: t.to, at: t.at, reason: t.reason }
      ],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const path = await writeManifest(deps.repoRoot, next);
    return { kind: "merge", contractVersion: 1, manifestPath: path, pr: m.prNumber, taskId: m.taskId };
  };
}

// src/tools/delivery-cleanup.js
import { resolve as resolve8 } from "node:path";
import { spawnSync as spawnSync3 } from "node:child_process";
function safeRemoveWorktree(repoRoot, path) {
  const r = spawnSync3("git", ["worktree", "remove", path], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  });
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}
function casDeleteBranch(repoRoot, branch, expectedSha) {
  const args = ["update-ref", "-d"];
  if (expectedSha && /^[0-9a-f]{7,}$/i.test(expectedSha)) {
    args.push(`refs/heads/${branch}`, expectedSha);
  } else {
    args.push(`refs/heads/${branch}`);
  }
  const r = spawnSync3("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  });
  return { status: r.status ?? -1, stderr: r.stderr ?? "" };
}
function branchStillExists(repoRoot, branch) {
  const r = spawnSync3(
    "git",
    ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env }
  );
  return r.status === 0;
}
function remoteBranchGone(repoRoot, branch, remote) {
  const r = spawnSync3("git", ["ls-remote", "--heads", remote, branch], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env
  });
  return r.status === 0 && !r.stdout.includes(`refs/heads/${branch}`);
}
function aheadOfRemote(repoRoot, branch, remote) {
  const r = spawnSync3(
    "git",
    ["rev-list", "--count", `${remote}/${branch}..${branch}`],
    { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env }
  );
  if (r.status !== 0) return null;
  const n = parseInt(r.stdout.trim(), 10);
  return Number.isFinite(n) ? n : null;
}
function createCleanupTool(deps) {
  return async function cleanup(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
    if (m.state !== "merged" && m.state !== "cleanup-pending") {
      return { kind: "manifest-state", state: m.state };
    }
    if (!m.worktreePath) return { kind: "missing-worktree-path" };
    const wtPath = resolve8(m.worktreePath);
    const mainCwd = resolve8(deps.repoRoot);
    if (wtPath === mainCwd) return { kind: "current-checkout", worktreePath: wtPath };
    if (!isWorktreeClean(wtPath)) return { kind: "dirty-worktree" };
    if (isRebaseInProgress(wtPath)) return { kind: "rebase-in-progress" };
    const head = currentHead(wtPath);
    if (!head || m.lastPrHeadSha && head !== m.lastPrHeadSha) {
      return {
        kind: "head-mismatch",
        headSha: head ?? "",
        manifestSha: m.lastPrHeadSha ?? ""
      };
    }
    const isBootstrapRecovery = m.state === "cleanup-pending" && m.prNumber === null;
    if (!isBootstrapRecovery && m.prNumber === null) {
      return { kind: "missing-pr" };
    }
    let prHeadSha = head;
    let prMerged = true;
    if (!isBootstrapRecovery) {
      const pr = await deps.driver.readPullRequest({
        repo: deps.repoSlug,
        number: m.prNumber
      });
      if (!pr.merged) {
        return {
          kind: "unmerged",
          headSha: pr.headSha,
          manifestSha: m.lastPrHeadSha ?? ""
        };
      }
      if (pr.baseRefName !== m.baseBranch) {
        return { kind: "base-mismatch", manifestBase: m.baseBranch, prBase: pr.baseRefName };
      }
      prHeadSha = pr.headSha;
      prMerged = pr.merged;
    }
    if (!isBootstrapRecovery && prHeadSha && prHeadSha !== head) {
      return {
        kind: "head-mismatch",
        headSha: head,
        manifestSha: prHeadSha
      };
    }
    const remote = deps.remote ?? "origin";
    const remoteGone = isBootstrapRecovery ? true : remoteBranchGone(wtPath, m.branch, remote);
    const ahead = remoteGone ? null : aheadOfRemote(wtPath, m.branch, remote);
    if (!remoteGone && ahead !== null && ahead > 0) {
      return {
        kind: "has-unpublished-commits",
        ahead,
        branch: m.branch,
        remote
      };
    }
    const removed = safeRemoveWorktree(deps.repoRoot, wtPath);
    if (removed.status !== 0) {
      return { kind: "remove-failed", stderr: removed.stderr };
    }
    const expectedSha = m.lastPrHeadSha ?? head ?? null;
    const branchResult = casDeleteBranch(deps.repoRoot, m.branch, expectedSha);
    if (branchResult.status !== 0 && branchStillExists(deps.repoRoot, m.branch)) {
      return { kind: "branch-delete-failed", stderr: branchResult.stderr };
    }
    const tCleanup = transition(m, "cleanup-pending", { reason: "worktree removed" });
    const candidate = tCleanup.ok ? {
      ...m,
      state: tCleanup.to,
      transitionLog: [
        ...m.transitionLog,
        { from: tCleanup.from, to: tCleanup.to, at: tCleanup.at, reason: tCleanup.reason }
      ],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    } : m;
    const tCleaned = transition(candidate, "cleaned", { reason: "manifest sealed" });
    if (tCleaned.ok) {
      const sealed = {
        ...candidate,
        state: tCleaned.to,
        transitionLog: [
          ...candidate.transitionLog,
          { from: tCleaned.from, to: tCleaned.to, at: tCleaned.at, reason: tCleaned.reason }
        ],
        updatedAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      await writeManifest(deps.repoRoot, sealed);
      await deleteManifest(deps.repoRoot, input.taskId);
    }
    return {
      contractVersion: 1,
      manifestPath: null,
      removedPath: wtPath,
      bootstrapRecovery: isBootstrapRecovery
    };
  };
}

// src/index.js
var PACKAGE_VERSION = "0.1.3";
export {
  ADAPTER_CONTRACT_VERSION,
  ADAPTER_FILENAME,
  LOCK_FILENAME,
  PACKAGE_VERSION,
  STATES,
  WorktreeRecord,
  branchExistsLocally,
  branchExistsRemotely,
  bucketFor,
  canTransition,
  checkGates,
  createCleanupTool,
  createGhDriver,
  createGhStub,
  createInspectTool,
  createIssueTool,
  createManifest,
  createMergeTool,
  createPrTool,
  createReadyTool,
  createReviewTool,
  createVerifyTool,
  createWorktree,
  createWorktreeFromLocal,
  createWorktreeTool,
  currentBranch,
  currentHead,
  defaultBranch,
  deleteManifest,
  doctor,
  fetchBranch,
  findOpencodeDir,
  gateFailureEnvelope,
  gateSnapshot,
  isInsideWorktree,
  isMainCheckout,
  isRebaseInProgress,
  isTerminal,
  isWorktreeClean,
  listManifests,
  listWorktrees,
  loadAdapter,
  mergeBaseRemoteHead,
  mergeIntoFeature,
  mustRerunReview,
  mustRerunVerifier,
  parseRepoSlug,
  push,
  pushForceDisabled,
  readLock,
  readManifest,
  recoverManifestAfterCrash,
  remoteExists,
  removeManifestIfSafe,
  revParse,
  scanRecovery,
  transition,
  validateAdapter,
  worktreeExists,
  wouldCleanupBeSafe,
  writeLock,
  writeManifest
};
