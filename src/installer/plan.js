/*
 * Plan artifact loader, validator, and helper utilities.
 *
 * A "plan" is the durable GPT-to-MiniMax handoff for a single
 * implementation ticket. The runtime reads only the file path,
 * the hash, and the revision; full content is meant for human
 * review and traceability, not for the consumer agent.
 *
 * Plans are append-only: revision N+1 is allowed only after
 * revision N is approved. Every revision carries a SHA-256 of
 * its canonical content. placeholderReview() surfaces any
 * unfinished sections so a GPT final-review can refuse approval.
 */

import { createHash } from "node:crypto";
import { stableStringify } from "./json-pointer.js";

export const DEFAULT_PLAN_VERSION = 1;

const REQUIRED_FIELDS = [
  "version",
  "revision",
  "parentIssue",
  "baseSha",
  "architecture",
  "globalConstraints",
  "fileResponsibilities",
  "tasks",
  "acceptance",
  "outOfScope",
  "recovery",
];

const REQUIRED_TASK_FIELDS = [
  "id",
  "description",
  "interfaces",
  "testSeams",
  "commands",
  "expectedEvidence",
];

const PLACEHOLDER_RE = /<placeholder>/i;

/**
 * Fail-closed plan validator. Returns `{ ok, kind, issues }` so
 * callers can map kinds to exit codes. Never throws.
 */
export function validatePlan(raw) {
  if (raw === null || raw === undefined) {
    return { ok: false, kind: "shape", issues: ["plan is empty"] };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, kind: "shape", issues: ["plan root must be an object"] };
  }
  const issues = [];
  let kind = "ok";
  if (raw.version !== DEFAULT_PLAN_VERSION) {
    issues.push(`unsupported plan version: ${JSON.stringify(raw.version)} (expected ${DEFAULT_PLAN_VERSION})`);
    kind = "shape";
  }
  for (const f of REQUIRED_FIELDS) {
    if (f === "tasks") {
      if (!Array.isArray(raw[f]) || raw[f].length === 0) {
        issues.push(`tasks must be a non-empty array: missing ${f}`);
        kind = "shape";
      }
    } else if (raw[f] === undefined || raw[f] === null) {
      issues.push(`missing required field: ${f}`);
      kind = "shape";
    }
  }
  if (Array.isArray(raw.tasks)) {
    raw.tasks.forEach((t, i) => {
      if (!t || typeof t !== "object") {
        issues.push(`task[${i}] is not an object`);
        kind = "shape";
        return;
      }
      for (const f of REQUIRED_TASK_FIELDS) {
        if (t[f] === undefined || t[f] === null) {
          issues.push(`task[${i}].${f} missing`);
          kind = "shape";
        }
      }
    });
  }
  if (typeof raw.revision !== "number" || !Number.isInteger(raw.revision) || raw.revision < 1) {
    issues.push(`revision must be a positive integer: ${raw.revision}`);
    kind = "shape";
  }
  return { ok: issues.length === 0, kind, issues };
}

/**
 * Stable SHA-256 over the canonical plan content. The hash is
 * what consumers and run ledgers actually rely on; runtime never
 * reads the plan body, only its hash and revision.
 */
export function computePlanHash(plan) {
  return createHash("sha256").update(stableStringify(plan)).digest("hex");
}

/**
 * Append-only revision check. Returns true iff the new plan is
 * exactly one revision greater than the previous one. Rejects
 * same-revision writes (overwrite) and backwards jumps.
 */
export function canRevise(previous, next) {
  if (!previous || !next) return false;
  if (typeof next.revision !== "number" || typeof previous.revision !== "number") return false;
  return next.revision === previous.revision + 1;
}

/**
 * Self-review helper. Returns `{ ok, matches }` where matches is
 * a list of paths/fields that contain the placeholder marker.
 * The GPT final-reviewer refuses plans with any matches.
 */
export function planNeedsPlaceholderReview(plan) {
  const matches = [];
  function walk(node, path) {
    if (typeof node === "string") {
      if (PLACEHOLDER_RE.test(node)) matches.push(path);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${path}[${i}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k);
    }
  }
  walk(plan, "");
  return { ok: matches.length === 0, matches };
}

/**
 * Compact summary used by the run ledger and the chat pointer.
 * Runtime never reads the plan body, only this summary.
 */
export function planSummary(plan) {
  return {
    version: plan?.version,
    revision: plan?.revision,
    tasks: Array.isArray(plan?.tasks) ? plan.tasks.length : 0,
    parentIssue: plan?.parentIssue,
    baseSha: plan?.baseSha,
    hash: plan ? computePlanHash(plan) : null,
  };
}
