/**
 * Task reviewer Spec + Quality verdict.
 *
 * A single, immutable verdict submitted through
 * `ship_task_review`. The verdict is bound to one (plan hash,
 * task id, round, workspace hash) tuple; the controller
 * refuses to commit a verdict that disagrees.
 *
 * Axes:
 *   - spec: does the change satisfy every acceptance
 *     criterion in the task brief?
 *   - quality: is the change correct, complete, and in a
 *     shippable state?
 *
 * A verdict is `pass` only when every blocking finding is
 * addressed. Otherwise the verdict is `fail`.
 */

import { createHash } from "node:crypto";
import { canonicalJson } from "../installer/json-pointer.js";

/**
 * @typedef {"pass" | "fail"} Verdict
 */

/**
 * @typedef {Object} TaskReviewFinding
 * @property {"spec" | "quality"} axis
 * @property {"info" | "warning" | "blocking"} severity
 * @property {string} message
 * @property {string} [pointer] JSON pointer in the diff (when applicable).
 * @property {string} [reproducer] Path to the reproducer test (blocking only).
 */

/**
 * @typedef {Object} TaskReviewVerdict
 * @property {string} planHash
 * @property {string} taskId
 * @property {number} round
 * @property {string} workspaceHash
 * @property {Verdict} verdict
 * @property {TaskReviewFinding[]} findings
 * @property {string} reviewerSessionID
 * @property {string} reviewerModel
 * @property {string} reviewedAt ISO timestamp.
 */

const REVIEWER_MODEL_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

/**
 * Validate a verdict shape. Returns `{ ok, kind, issues }`.
 *
 * @param {unknown} raw
 * @returns {{ ok: boolean, kind: string, issues: string[] }}
 */
export function validateTaskReviewVerdict(raw) {
  const issues = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, kind: "shape", issues: ["verdict root must be an object"] };
  }
  if (typeof raw.planHash !== "string" || !/^[0-9a-f]{64}$/.test(raw.planHash)) {
    issues.push("planHash must be a 64-char hex string");
  }
  if (typeof raw.taskId !== "string" || raw.taskId.length === 0) {
    issues.push("taskId must be a non-empty string");
  }
  if (typeof raw.round !== "number" || !Number.isInteger(raw.round) || raw.round < 1) {
    issues.push("round must be a positive integer");
  }
  if (typeof raw.workspaceHash !== "string" || !/^[0-9a-f]{64}$/.test(raw.workspaceHash)) {
    issues.push("workspaceHash must be a 64-char hex string");
  }
  if (raw.verdict !== "pass" && raw.verdict !== "fail") {
    issues.push("verdict must be 'pass' or 'fail'");
  }
  if (!Array.isArray(raw.findings)) {
    issues.push("findings must be an array");
  } else {
    for (const f of raw.findings) {
      if (!f || typeof f !== "object") {
        issues.push("finding must be an object");
        continue;
      }
      if (!["spec", "quality"].includes(f.axis)) {
        issues.push(`finding.axis must be spec|quality, got ${JSON.stringify(f.axis)}`);
      }
      if (!["info", "warning", "blocking"].includes(f.severity)) {
        issues.push(`finding.severity must be info|warning|blocking, got ${JSON.stringify(f.severity)}`);
      }
      if (typeof f.message !== "string" || f.message.length === 0) {
        issues.push("finding.message must be a non-empty string");
      }
      if (f.severity === "blocking" && raw.verdict === "pass") {
        issues.push("verdict=pass with a blocking finding is forbidden");
      }
    }
  }
  if (typeof raw.reviewerSessionID !== "string" || raw.reviewerSessionID.length === 0) {
    issues.push("reviewerSessionID must be a non-empty string");
  }
  if (typeof raw.reviewerModel !== "string" || !REVIEWER_MODEL_RE.test(raw.reviewerModel)) {
    issues.push("reviewerModel must be a <provider>/<model> id");
  }
  if (typeof raw.reviewedAt !== "string" || raw.reviewedAt.length === 0) {
    issues.push("reviewedAt must be an ISO timestamp");
  }
  return { ok: issues.length === 0, kind: issues.length === 0 ? "ok" : "shape", issues };
}

/**
 * Compute the canonical hash of a verdict. The controller
 * binds commits to this hash so the verdict cannot be
 * silently rewritten.
 *
 * @param {TaskReviewVerdict} verdict
 * @returns {string}
 */
export function hashVerdict(verdict) {
  const json = canonicalJson(verdict);
  return createHash("sha256").update(json, "utf8").digest("hex");
}
