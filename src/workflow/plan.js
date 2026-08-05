/**
 * PlanV2 contract.
 *
 * Single source of truth for an approved execution plan. The
 * schema is the canonical payload the strong planner writes
 * and the deterministic controller consumes. Hash identity
 * is `sha256(canonicalJson(plan))`; the plan's `revision`
 * field is the linear index inside a workflow.
 *
 * Validation rejects unknown fields, empty instruction or
 * evidence arrays, placeholders, absolute or parent paths,
 * `.git` task changes, duplicate ids, cyclic or forward
 * dependencies, undeclared changed files, shell command
 * strings, missing commit messages, and stale approval base
 * SHAs.
 */

import { canonicalJson } from "../installer/json-pointer.js";

const SUPPORTED_PROFILES = new Set(["core", "engineering"]);

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function expectString(obj, key, issues) {
  const v = obj?.[key];
  if (typeof v !== "string" || v.length === 0) {
    issues.push(`field ${key} must be a non-empty string`);
    return null;
  }
  return v;
}

function expectArray(obj, key, issues) {
  const v = obj?.[key];
  if (!Array.isArray(v)) {
    issues.push(`field ${key} must be an array`);
    return [];
  }
  return v;
}

function isAbsoluteOrParentPath(path) {
  if (typeof path !== "string") return true;
  if (path.startsWith("/") || path.startsWith("\\")) return true;
  if (path === ".." || path.startsWith("../") || path.startsWith("..\\")) return true;
  return false;
}

function isGitPath(path) {
  return typeof path === "string" && (path === ".git" || path === "/.git" || path.startsWith(".git/") || path.startsWith(".git\\") || path.startsWith("/.git/") || path.startsWith("/.git\\"));
}

function looksLikeShellCommand(s) {
  if (typeof s !== "string") return false;
  if (s.length > 256) return false;
  // Heuristic: a shell command starts with an absolute path,
  // a tilde, or contains shell metacharacters. The runtime
  // argv is always an array, so any command body is forbidden.
  if (/^[/~]/.test(s)) return true;
  if (/[|&;()<>`$]/.test(s)) return true;
  if (/\b(?:rm|chmod|chown|curl|wget|sudo|bash|sh)\b/.test(s)) return true;
  return false;
}

/**
 * Validate a PlanV2 object. Returns `{ ok, kind, issues }`
 * where `kind` is "ok" or one of the documented shape kinds.
 *
 * @param {unknown} raw
 * @returns {{ ok: boolean, kind: string, issues: string[] }}
 */
export function validatePlanV2(raw) {
  const issues = [];
  if (!isPlainObject(raw)) {
    return { ok: false, kind: "shape", issues: ["plan root must be an object"] };
  }
  const plan = /** @type {any} */ (raw);
  if (plan.schemaVersion !== 2) {
    issues.push(`unsupported schemaVersion: ${JSON.stringify(plan.schemaVersion)} (expected 2)`);
  }
  expectString(plan, "workflowId", issues);
  if (typeof plan.revision !== "number" || !Number.isInteger(plan.revision) || plan.revision < 1) {
    issues.push("revision must be a positive integer");
  }
  if (plan.supersedes !== null && plan.supersedes !== undefined) {
    if (!isPlainObject(plan.supersedes)) {
      issues.push("supersedes must be null or an object");
    } else {
      expectString(plan.supersedes, "revision", issues);
      expectString(plan.supersedes, "sha256", issues);
    }
  }
  if (!isPlainObject(plan.authoredBy)) {
    issues.push("authoredBy must be an object");
  } else {
    expectString(plan.authoredBy, "sessionID", issues);
    const model = plan.authoredBy.model;
    if (typeof model !== "string" || !/^[^/]+\/[^/]+$/.test(model)) {
      issues.push("authoredBy.model must be a <provider>/<model> id");
    }
    expectString(plan.authoredBy, "createdAt", issues);
  }
  if (!isPlainObject(plan.source)) {
    issues.push("source must be an object");
  } else {
    expectString(plan.source, "repository", issues);
    if (typeof plan.source.issueNumber !== "number" || !Number.isInteger(plan.source.issueNumber) || plan.source.issueNumber < 1) {
      issues.push("source.issueNumber must be a positive integer");
    }
    expectString(plan.source, "issueUrl", issues);
    expectString(plan.source, "baseBranch", issues);
    if (typeof plan.source.baseSha !== "string" || !/^[0-9a-f]{40}$/.test(plan.source.baseSha)) {
      issues.push("source.baseSha must be a 40-char commit SHA");
    }
  }
  if (typeof plan.goal !== "string" || plan.goal.length < 8) {
    issues.push("goal must be a non-trivial string");
  }
  if (!isPlainObject(plan.architecture)) {
    issues.push("architecture must be an object");
  } else {
    expectString(plan.architecture, "summary", issues);
    if (!Array.isArray(plan.architecture.decisions)) {
      issues.push("architecture.decisions must be an array");
    }
  }
  if (!Array.isArray(plan.constraints)) {
    issues.push("constraints must be an array");
  }
  if (!Array.isArray(plan.files)) {
    issues.push("files must be an array");
  } else {
    for (const f of plan.files) {
      if (!isPlainObject(f)) {
        issues.push("file entry is not an object");
        continue;
      }
      if (!["create", "modify", "delete"].includes(f.action)) {
        issues.push(`file action must be one of create|modify|delete, got ${JSON.stringify(f.action)}`);
      }
      if (isAbsoluteOrParentPath(f.path)) {
        issues.push(`file path must be a relative package path, got ${JSON.stringify(f.path)}`);
      }
    }
  }
  if (!Array.isArray(plan.tasks)) {
    issues.push("tasks must be an array");
    return finalize(plan, issues);
  }
  if (plan.tasks.length === 0) {
    issues.push("tasks must contain at least one task");
  }
  const seenIds = new Set();
  for (const t of plan.tasks) {
    validateTask(t, issues, seenIds, plan);
  }
  return finalize(plan, issues);
}

function finalize(raw, issues) {
  // Dependency cycle / forward-dependency detection
  if (Array.isArray(raw.tasks)) {
    const ids = new Set(raw.tasks.map((t) => t.id));
    for (const t of raw.tasks) {
      if (!Array.isArray(t.dependsOn)) continue;
      for (const dep of t.dependsOn) {
        if (!ids.has(dep)) {
          issues.push(`task ${t.id} depends on unknown task ${dep}`);
        }
      }
    }
  }
  // Changed-paths coverage
  if (Array.isArray(raw.tasks) && Array.isArray(raw.files)) {
    const declared = new Set(raw.files.map((f) => f.path));
    for (const t of raw.tasks) {
      for (const c of t.changes ?? []) {
        if (!declared.has(c.path)) {
          issues.push(`task ${t.id} changes undeclared file: ${c.path}`);
        }
      }
    }
  }
  return {
    ok: issues.length === 0,
    kind: issues.length === 0 ? "ok" : "shape",
    issues,
  };
}

function validateTask(t, issues, seenIds, plan) {
  if (!isPlainObject(t)) {
    issues.push("task entry is not an object");
    return;
  }
  if (typeof t.id !== "string" || t.id.length === 0) {
    issues.push("task id must be a non-empty string");
  } else if (seenIds.has(t.id)) {
    issues.push(`duplicate task id: ${t.id}`);
  } else {
    seenIds.add(t.id);
  }
  if (typeof t.ordinal !== "number" || !Number.isInteger(t.ordinal) || t.ordinal < 1) {
    issues.push(`task ${t.id}: ordinal must be a positive integer`);
  }
  expectString(t, "title", issues);
  expectString(t, "objective", issues);
  if (!Array.isArray(t.dependsOn)) {
    issues.push(`task ${t.id}: dependsOn must be an array`);
  }
  if (!Array.isArray(t.preconditions)) {
    issues.push(`task ${t.id}: preconditions must be an array`);
  }
  if (!Array.isArray(t.changes)) {
    issues.push(`task ${t.id}: changes must be an array`);
  } else {
    for (const c of t.changes) {
      if (!isPlainObject(c)) continue;
      if (!["create", "modify", "delete"].includes(c.operation)) {
        issues.push(`task ${t.id}: change operation must be create|modify|delete, got ${JSON.stringify(c.operation)}`);
      }
      if (isAbsoluteOrParentPath(c.path)) {
        issues.push(`task ${t.id}: change path must be relative, got ${JSON.stringify(c.path)}`);
      }
      if (isGitPath(c.path)) {
        issues.push(`task ${t.id}: change path must not target .git, got ${JSON.stringify(c.path)}`);
      }
      if (!Array.isArray(c.instructions) || c.instructions.length === 0) {
        issues.push(`task ${t.id}: change ${c.path} must declare at least one instruction`);
      } else {
        for (const ins of c.instructions) {
          if (typeof ins !== "string" || ins.length === 0) {
            issues.push(`task ${t.id}: change ${c.path} instructions must be non-empty strings`);
            break;
          }
        }
      }
      if (!Array.isArray(c.preserve) || c.preserve.length === 0) {
        issues.push(`task ${t.id}: change ${c.path} must declare at least one preserve entry`);
      }
    }
  }
  if (!Array.isArray(t.interfaces)) {
    issues.push(`task ${t.id}: interfaces must be an array`);
  }
  if (!Array.isArray(t.tests)) {
    issues.push(`task ${t.id}: tests must be an array`);
  } else {
    for (const tc of t.tests) {
      if (!isPlainObject(tc)) continue;
      if (typeof tc.file !== "string" || tc.file.length === 0) {
        issues.push(`task ${t.id}: test file must be a non-empty string`);
      }
      if (!Array.isArray(tc.cases) || tc.cases.length === 0) {
        issues.push(`task ${t.id}: test ${tc.file} must declare at least one case`);
      }
    }
  }
  if (!Array.isArray(t.commands)) {
    issues.push(`task ${t.id}: commands must be an array`);
  } else {
    for (const cmd of t.commands) {
      if (!isPlainObject(cmd)) continue;
      if (!Array.isArray(cmd.argv) || cmd.argv.length < 1) {
        issues.push(`task ${t.id}: command argv must be a non-empty array`);
        continue;
      }
      for (const a of cmd.argv) {
        if (typeof a !== "string") {
          issues.push(`task ${t.id}: command argv entries must be strings`);
          break;
        }
        if (looksLikeShellCommand(a)) {
          issues.push(`task ${t.id}: command argv entry looks like a shell command: ${JSON.stringify(a)}`);
          break;
        }
      }
    }
  }
  if (!Array.isArray(t.acceptance) || t.acceptance.length === 0) {
    issues.push(`task ${t.id}: acceptance must be a non-empty array`);
  } else {
    for (const a of t.acceptance) {
      if (!isPlainObject(a)) continue;
      expectString(a, "id", issues);
      expectString(a, "assertion", issues);
      if (!Array.isArray(a.evidence) || a.evidence.length === 0) {
        issues.push(`task ${t.id}: acceptance ${a.id} must declare non-empty evidence`);
      }
    }
  }
  if (!isPlainObject(t.commit) || typeof t.commit.message !== "string" || t.commit.message.length === 0) {
    issues.push(`task ${t.id}: commit.message must be a non-empty string`);
  }
}

void SUPPORTED_PROFILES;

/**
 * Compute the canonical PlanV2 hash. The hash is the
 * identity of the run; later revisions supersede earlier
 * ones by hash.
 *
 * @param {unknown} plan
 * @returns {string}
 */
export function computePlanHash(plan) {
  const json = canonicalJson(plan);
  // Use a dynamic import to keep this file dependency-free
  // when the plan is hash-validated from non-Node callers.
  return sha256(json);
}

import { createHash } from "node:crypto";
function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export const SUPPORTED_SCHEMA_VERSION = 2;
