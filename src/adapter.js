/**
 * Project-adapter schema and loader for opencode-delivery.
 *
 * The adapter is a JSON document (`delivery.json`) committed in a
 * consumer repo at `.opencode/delivery.json`. It declares the
 * tech-stack-specific commands without leaking them into this core
 * package. The loader reads, validates, and locks the adapter version.
 */

import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createHash } from "node:crypto";

export const ADAPTER_CONTRACT_VERSION = 1;
export const LOCK_FILENAME = "delivery.lock.json";
export const ADAPTER_FILENAME = "delivery.json";

const KNOWN_KEYS = new Set([
  "contractVersion",
  "repository",
  "forge",
  "worktree",
  "verification",
  "review",
  "ci",
  "ready",
  "merge",
  "cleanup",
]);

const KNOWN_REPOSITORY_KEYS = new Set(["remote", "defaultBranch"]);
const KNOWN_FORGE_KEYS = new Set(["driver", "issueRequired", "draftAfterFirstCommit", "issueClosingSyntax"]);
const KNOWN_WORKTREE_KEYS = new Set(["root", "branchTemplate", "bootstrap"]);
const KNOWN_VERIFICATION_KEYS = new Set(["commands", "requireCleanDiffAfter", "invalidateOnHeadChange"]);
const KNOWN_REVIEW_KEYS = new Set(["agent", "required", "invalidateOnHeadChange"]);
const KNOWN_CI_KEYS = new Set(["driver", "requiredChecks", "wait", "flakyRetry"]);
const KNOWN_READY_KEYS = new Set(["requires", "stopAfterReady"]);
const KNOWN_MERGE_KEYS = new Set(["strategy", "policy", "requireFreshGates"]);
const KNOWN_CLEANUP_KEYS = new Set(["when", "requires"]);

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

export function validateAdapter(value) {
  const issues = [];
  if (!value || typeof value !== "object") {
    return { ok: false, issues: ["root must be an object"] };
  }
  const obj = value;
  for (const k of Object.keys(obj)) {
    if (!KNOWN_KEYS.has(k)) issues.push(`root.${k} is not a recognised field`);
  }
  if (obj.contractVersion !== 1) issues.push("contractVersion must be the literal 1");

  if (obj.repository !== undefined) {
    const r = obj.repository;
    issues.push(...issuesFor("repository", KNOWN_REPOSITORY_KEYS, r));
    if (r.defaultBranch !== undefined) {
      const db = r.defaultBranch;
      if (db.discover !== undefined && typeof db.discover !== "boolean") issues.push("repository.defaultBranch.discover must be boolean");
      if (db.name !== undefined && typeof db.name !== "string") issues.push("repository.defaultBranch.name must be string");
    }
  }

  if (obj.forge !== undefined) {
    const f = obj.forge;
    issues.push(...issuesFor("forge", KNOWN_FORGE_KEYS, f));
    if (f.driver !== undefined && f.driver !== "github") issues.push("forge.driver must be 'github'");
    if (f.issueRequired !== undefined && typeof f.issueRequired !== "boolean") issues.push("forge.issueRequired must be boolean");
    if (f.draftAfterFirstCommit !== undefined && typeof f.draftAfterFirstCommit !== "boolean") issues.push("forge.draftAfterFirstCommit must be boolean");
    if (f.issueClosingSyntax !== undefined && typeof f.issueClosingSyntax !== "boolean") issues.push("forge.issueClosingSyntax must be boolean");
  }

  if (obj.worktree !== undefined) {
    const w = obj.worktree;
    issues.push(...issuesFor("worktree", KNOWN_WORKTREE_KEYS, w));
    if (w.root !== undefined && typeof w.root !== "string") issues.push("worktree.root must be string");
    if (w.branchTemplate !== undefined && typeof w.branchTemplate !== "string") issues.push("worktree.branchTemplate must be string");
    if (w.bootstrap !== undefined && !isStringArrayOfArrays(w.bootstrap)) issues.push("worktree.bootstrap must be an array of argv arrays");
  }

  if (obj.verification !== undefined) {
    const v = obj.verification;
    issues.push(...issuesFor("verification", KNOWN_VERIFICATION_KEYS, v));
    if (v.commands !== undefined) {
      if (!Array.isArray(v.commands)) issues.push("verification.commands must be an array");
      else {
        for (let i = 0; i < v.commands.length; i++) {
          const cmd = v.commands[i];
          if (typeof cmd.id !== "string") issues.push(`verification.commands[${i}].id must be string`);
          if (!Array.isArray(cmd.argv) || !cmd.argv.every((s) => typeof s === "string")) issues.push(`verification.commands[${i}].argv must be string[]`);
          if (cmd.timeoutMs !== undefined && typeof cmd.timeoutMs !== "number") issues.push(`verification.commands[${i}].timeoutMs must be number`);
        }
      }
    }
    if (v.requireCleanDiffAfter !== undefined && typeof v.requireCleanDiffAfter !== "boolean") issues.push("verification.requireCleanDiffAfter must be boolean");
    if (v.invalidateOnHeadChange !== undefined && typeof v.invalidateOnHeadChange !== "boolean") issues.push("verification.invalidateOnHeadChange must be boolean");
  }

  if (obj.review !== undefined) {
    const r = obj.review;
    issues.push(...issuesFor("review", KNOWN_REVIEW_KEYS, r));
    if (r.agent !== undefined && typeof r.agent !== "string") issues.push("review.agent must be string");
    if (r.required !== undefined && typeof r.required !== "boolean") issues.push("review.required must be boolean");
    if (r.invalidateOnHeadChange !== undefined && typeof r.invalidateOnHeadChange !== "boolean") issues.push("review.invalidateOnHeadChange must be boolean");
  }

  if (obj.ci !== undefined) {
    const c = obj.ci;
    issues.push(...issuesFor("ci", KNOWN_CI_KEYS, c));
    if (c.driver !== undefined && c.driver !== "github-status-checks") issues.push("ci.driver must be 'github-status-checks'");
    if (c.requiredChecks !== undefined && !isStringArray(c.requiredChecks)) issues.push("ci.requiredChecks must be string[]");
    if (c.wait !== undefined && typeof c.wait !== "boolean") issues.push("ci.wait must be boolean");
    if (c.flakyRetry !== undefined && c.flakyRetry !== 0 && c.flakyRetry !== 1) issues.push("ci.flakyRetry must be 0 or 1");
  }

  if (obj.ready !== undefined) {
    const r = obj.ready;
    issues.push(...issuesFor("ready", KNOWN_READY_KEYS, r));
    if (r.requires !== undefined) {
      const set = new Set(["review", "local-verification", "remote-ci"]);
      const arr = r.requires;
      if (!Array.isArray(arr) || !arr.every((x) => typeof x === "string" && set.has(x))) {
        issues.push("ready.requires must be one of review|local-verification|remote-ci");
      }
    }
    if (r.stopAfterReady !== undefined && typeof r.stopAfterReady !== "boolean") issues.push("ready.stopAfterReady must be boolean");
  }

  if (obj.merge !== undefined) {
    const m = obj.merge;
    issues.push(...issuesFor("merge", KNOWN_MERGE_KEYS, m));
    if (m.strategy !== undefined && m.strategy !== "squash") issues.push("merge.strategy must be 'squash'");
    if (m.policy !== undefined && m.policy !== "explicit-user-request-only") issues.push("merge.policy must be 'explicit-user-request-only'");
    if (m.requireFreshGates !== undefined && typeof m.requireFreshGates !== "boolean") issues.push("merge.requireFreshGates must be boolean");
  }

  if (obj.cleanup !== undefined) {
    const c = obj.cleanup;
    issues.push(...issuesFor("cleanup", KNOWN_CLEANUP_KEYS, c));
    if (c.when !== undefined && c.when !== "next-task") issues.push("cleanup.when must be 'next-task'");
    if (c.requires !== undefined) {
      const set = new Set(["pr-merged", "worktree-clean", "no-unpublished-commits"]);
      const arr = c.requires;
      if (!Array.isArray(arr) || !arr.every((x) => typeof x === "string" && set.has(x))) {
        issues.push("cleanup.requires must be one of pr-merged|worktree-clean|no-unpublished-commits");
      }
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, adapter: obj };
}

export async function loadAdapter(repoRoot) {
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

export async function writeLock(repoRoot, adapterSha256) {
  const lockPath = resolve(repoRoot, ".opencode", LOCK_FILENAME);
  await mkdir(dirname(lockPath), { recursive: true });
  const lock = {
    contractVersion: 1,
    adapterSha256,
    writtenAt: new Date().toISOString(),
  };
  const tmp = `${lockPath}.tmp`;
  await writeFile(tmp, JSON.stringify(lock, null, 2) + "\n", "utf8");
  await rename(tmp, lockPath);
  return lockPath;
}

export async function readLock(repoRoot) {
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

export function findOpencodeDir(start) {
  let cur = resolve(start);
  while (true) {
    const candidate = join(cur, ".opencode");
    try {
      const fs = require("node:fs");
      if (fs.existsSync(join(candidate, ADAPTER_FILENAME))) return candidate;
    } catch {
      return null;
    }
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
}
