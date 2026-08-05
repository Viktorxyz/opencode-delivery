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
 * @typedef {Object} GateEvidence
 * @property {string} headSha
 * @property {string} prHeadSha
 * @property {string} [mergeBaseSha]
 * @property {string} [packageHash]
 * @property {string} [verificationHash]
 * @property {string} [ciHash]
 * @property {string} [standardsReviewHash]
 * @property {string} [specReviewHash]
 * @property {string} [source]
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
 *   standards: GateEvidence,
 *   spec: GateEvidence,
 *   verification: GateEvidence,
 *   ci: GateEvidence,
 *   pr: GateEvidence,
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
  if (input.verification.exitCode !== 0) {
    return refute(`verification: exit=${input.verification.exitCode}`);
  }
  if (input.ci.state !== "pass") {
    return refute(`ci: state=${input.ci.state}`);
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
 *   runGate: () => Promise<GateEvidence>,
 *   specGate: () => Promise<GateEvidence>,
 *   verificationGate: () => Promise<GateEvidence>,
 *   ciGate: () => Promise<GateEvidence>,
 *   prGate: () => Promise<GateEvidence>,
 * }} input
 * @returns {Promise<{ ok: boolean, reason?: string, headSha?: string, evidence: { standards: GateEvidence, spec: GateEvidence, verification: GateEvidence, ci: GateEvidence, pr: GateEvidence } }>}
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
 * @param {{ standards: GateEvidence, spec: GateEvidence, verification: GateEvidence, ci: GateEvidence, pr: GateEvidence }} evidence
 * @returns {string}
 */
export function hashSameHeadEvidence(evidence) {
  const partSort = (obj) => Object.keys(obj).sort().reduce((acc, k) => ({ ...acc, [k]: obj[k] }), {});
  const payload = {
    standards: partSort({ headSha: evidence.standards.headSha, packageHash: evidence.standards.packageHash, verdict: evidence.standards.verdict }),
    spec: partSort({ headSha: evidence.spec.headSha, packageHash: evidence.spec.packageHash, verdict: evidence.spec.verdict }),
    verification: partSort({ headSha: evidence.verification.headSha, exitCode: evidence.verification.exitCode, hash: evidence.verification.hash }),
    ci: partSort({ headSha: evidence.ci.headSha, state: evidence.ci.state, hash: evidence.ci.hash }),
    pr: partSort({ headSha: evidence.pr.headSha, prHeadSha: evidence.pr.prHeadSha }),
  };
  const sorted = partSort(payload);
  const canonical = JSON.stringify(sorted);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

export const GATE_EVIDENCE_SCHEMA = "v1";