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
  const v = /** @type {any} */ (raw);
  if (typeof v.planHash !== "string" || !/^[0-9a-f]{64}$/.test(v.planHash)) {
    issues.push("planHash must be a 64-char hex string");
  }
  if (typeof v.taskId !== "string" || v.taskId.length === 0) {
    issues.push("taskId must be a non-empty string");
  }
  if (typeof v.round !== "number" || !Number.isInteger(v.round) || v.round < 1) {
    issues.push("round must be a positive integer");
  }
  if (typeof v.workspaceHash !== "string" || !/^[0-9a-f]{64}$/.test(v.workspaceHash)) {
    issues.push("workspaceHash must be a 64-char hex string");
  }
  if (v.verdict !== "pass" && v.verdict !== "fail") {
    issues.push("verdict must be 'pass' or 'fail'");
  }
  if (!Array.isArray(v.findings)) {
    issues.push("findings must be an array");
  } else {
    for (const f of v.findings) {
      if (!f || typeof f !== "object") {
        issues.push("finding must be an object");
        continue;
      }
      const finding = /** @type {any} */ (f);
      if (!["spec", "quality"].includes(finding.axis)) {
        issues.push(`finding.axis must be spec|quality, got ${JSON.stringify(finding.axis)}`);
      }
      if (!["info", "warning", "blocking"].includes(finding.severity)) {
        issues.push(`finding.severity must be info|warning|blocking, got ${JSON.stringify(finding.severity)}`);
      }
      if (typeof finding.message !== "string" || finding.message.length === 0) {
        issues.push("finding.message must be a non-empty string");
      }
      if (finding.severity === "blocking" && v.verdict === "pass") {
        issues.push("verdict=pass with a blocking finding is forbidden");
      }
    }
  }
  if (typeof v.reviewerSessionID !== "string" || v.reviewerSessionID.length === 0) {
    issues.push("reviewerSessionID must be a non-empty string");
  }
  if (typeof v.reviewerModel !== "string" || !REVIEWER_MODEL_RE.test(v.reviewerModel)) {
    issues.push("reviewerModel must be a <provider>/<model> id");
  }
  if (typeof v.reviewedAt !== "string" || v.reviewedAt.length === 0) {
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
