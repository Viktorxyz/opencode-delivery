/**
 * Same-HEAD gate coordinator.
 *
 * Final Standards and Spec reviews, local verification, CI, and
 * Ready must all reference the same HEAD. This module is the
 * single source of truth for the gate invariant:
 *
 *   Standards.head = Spec.head = Verification.head
 *                  = CI.head = PR.head = Ready.head
 *
 * The coordinator refuses to advance when any pair of records
 * disagrees; the controller exits non-zero and the run stays
 * in commit-pending.
 *
 * The gate is pure: every entry takes the immutable inputs
 * and returns a `{ ok, reason }` decision. The controller
 * performs the actual GitHub mutations after the gate returns
 * ok.
 */

import { createHash } from "node:crypto";

/**
 * @typedef {Object} StandardsEvidence
 * @property {string} headSha
 * @property {string} packageHash
 * @property {"pass" | "fail"} verdict
 * @property {string} [reviewerSessionID]
 * @property {string} [reviewerModel]
 */

/**
 * @typedef {Object} SpecEvidence
 * @property {string} headSha
 * @property {string} packageHash
 * @property {"pass" | "fail"} verdict
 * @property {string} [reviewerSessionID]
 * @property {string} [reviewerModel]
 */

/**
 * @typedef {Object} VerificationEvidence
 * @property {string} headSha
 * @property {number} exitCode
 * @property {string} [hash]
 */

/**
 * @typedef {Object} CiEvidence
 * @property {string} headSha
 * @property {"pass" | "failure" | "pending"} state
 * @property {string} [hash]
 */

/**
 * @typedef {Object} PrEvidence
 * @property {string} headSha
 * @property {string} prHeadSha
 */

function isSha(hex) {
  return typeof hex === "string" && /^[0-9a-f]{40}$/.test(hex);
}

function refute(reason) {
  return { ok: false, reason };
}

/**
 * Bind the per-axis final review records to a single HEAD.
 * The gate refuses to advance when the two axes disagree;
 * the controller calls this once before requesting a Ready.
 *
 * @param {{
 *   standards: StandardsEvidence,
 *   spec: SpecEvidence,
 *   verification: VerificationEvidence,
 *   ci: CiEvidence,
 *   pr: PrEvidence,
 * }} input
 * @returns {{ ok: boolean, reason?: string, headSha?: string }}
 */
export function checkSameHeadGate(input) {
  if (!input || !input.standards || !input.spec || !input.verification || !input.ci || !input.pr) {
    return refute("missing-evidence");
  }
  const heads = [
    input.standards.headSha,
    input.spec.headSha,
    input.verification.headSha,
    input.ci.headSha,
    input.pr.headSha,
  ];
  if (heads.some((h) => !isSha(h))) {
    return refute("invalid-head-sha");
  }
  const first = heads[0];
  if (!heads.every((h) => h === first)) {
    return refute(`head-mismatch: standards=${input.standards.headSha} spec=${input.spec.headSha} verify=${input.verification.headSha} ci=${input.ci.headSha} pr=${input.pr.headSha}`);
  }
  if (input.standards.verdict !== "pass" || input.spec.verdict !== "pass") {
    return refute(`verdict: standards=${input.standards.verdict} spec=${input.spec.verdict}`);
  }
  if ((/** @type {any} */ (input.verification)).exitCode !== 0) {
    return refute(`verification: exit=${(/** @type {any} */ (input.verification)).exitCode}`);
  }
  if ((/** @type {any} */ (input.ci)).state !== "pass") {
    return refute(`ci: state=${(/** @type {any} */ (input.ci)).state}`);
  }
  if (input.pr.headSha !== input.pr.prHeadSha) {
    return refute(`pr-head-drift: gate=${input.pr.headSha} current=${input.pr.prHeadSha}`);
  }
  return { ok: true, headSha: first };
}

/**
 * Run the four gate evals in parallel. The two reviewers are
 * dispatched concurrently so their wall-clock cost is
 * `max(standards, spec)` rather than `standards + spec`. The
 * helper accepts a `dispatcher` that returns a Promise for
 * each axis; tests use a stub dispatcher.
 *
 * @param {{
 *   runGate: () => Promise<StandardsEvidence>,
 *   specGate: () => Promise<SpecEvidence>,
 *   verificationGate: () => Promise<VerificationEvidence>,
 *   ciGate: () => Promise<CiEvidence>,
 *   prGate: () => Promise<PrEvidence>,
 * }} input
 * @returns {Promise<{ ok: boolean, reason?: string, headSha?: string, evidence: { standards: StandardsEvidence, spec: SpecEvidence, verification: VerificationEvidence, ci: CiEvidence, pr: PrEvidence } }>}
 */
export async function runSameHeadGate(input) {
  const [standards, spec, verification, ci, pr] = await Promise.all([
    input.runGate(),
    input.specGate(),
    input.verificationGate(),
    input.ciGate(),
    input.prGate(),
  ]);
  const result = checkSameHeadGate({ standards, spec, verification, ci, pr });
  return { ...result, evidence: { standards, spec, verification, ci, pr } };
}

/**
 * Hash the same-HEAD evidence for the durable manifest. The
 * hash binds the gate to the canonical evidence so a later
 * HEAD change invalidates the gate.
 *
 * @param {{ standards: StandardsEvidence, spec: SpecEvidence, verification: VerificationEvidence, ci: CiEvidence, pr: PrEvidence }} evidence
 * @returns {string}
 */
export function hashSameHeadEvidence(evidence) {
  const partSort = (obj) => Object.keys(obj).sort().reduce((acc, k) => ({ ...acc, [k]: obj[k] }), {});
  const payload = {
    standards: partSort({ headSha: evidence.standards.headSha, packageHash: evidence.standards.packageHash, verdict: (/** @type {any} */ (evidence.standards)).verdict }),
    spec: partSort({ headSha: evidence.spec.headSha, packageHash: evidence.spec.packageHash, verdict: (/** @type {any} */ (evidence.spec)).verdict }),
    verification: partSort({ headSha: (/** @type {any} */ (evidence.verification)).headSha, exitCode: (/** @type {any} */ (evidence.verification)).exitCode, hash: (/** @type {any} */ (evidence.verification)).hash }),
    ci: partSort({ headSha: evidence.ci.headSha, state: (/** @type {any} */ (evidence.ci)).state, hash: (/** @type {any} */ (evidence.ci)).hash }),
    pr: partSort({ headSha: evidence.pr.headSha, prHeadSha: evidence.pr.prHeadSha }),
  };
  const sorted = partSort(payload);
  const canonical = JSON.stringify(sorted);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export const GATE_EVIDENCE_SCHEMA = "v1";
