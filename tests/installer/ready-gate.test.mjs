/*
 * Unit tests for src/installer/ready-gate.js.
 *
 * The Ready gate combines the final review (Standards + Spec
 * axes), the independent verifier output, and the CI status
 * for one HEAD. delivery-verifier runs the canonical consumer
 * verification command without Build's involvement (Build
 * cannot self-record the verification), and delivery_ready
 * refuses stale review, stale verification, failed CI, or
 * changed HEAD.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  recordVerifierOutput,
  shouldRecordFinalReview,
  isReviewStale,
  isVerifierStale,
  isReady,
  buildCannotSelfRecord,
  recordReady,
} from "../../src/installer/ready-gate.js";

test("recordVerifierOutput: stamps the verifier output and locks it to the current HEAD", () => {
  const v = recordVerifierOutput({
    head: "abc",
    verifierCommand: "pnpm run verify",
    exitCode: 0,
    output: "302/302 pass",
  });
  assert.equal(v.head, "abc");
  assert.equal(v.exitCode, 0);
});

test("shouldRecordFinalReview: pass only when both axes are non-blocking on the current HEAD", () => {
  // Pure delegation to final-review so the gate has one source
  // of truth for the review-side contract.
  const standards = { head: "h", findings: [] };
  const spec = { head: "h", findings: [] };
  assert.equal(shouldRecordFinalReview(standards, spec, "h"), true);
  assert.equal(shouldRecordFinalReview(standards, { head: "h", findings: [{ kind: "blocking" }] }, "h"), false);
  assert.equal(shouldRecordFinalReview(standards, { head: "old" }, "new"), false);
});

test("isReviewStale: rejects when HEAD has moved", () => {
  assert.equal(isReviewStale("a", "a"), false);
  assert.equal(isReviewStale("a", "b"), true);
});

test("isVerifierStale: same staleness rule for the verifier", () => {
  assert.equal(isVerifierStale("a", "a"), false);
  assert.equal(isVerifierStale("a", "b"), true);
});

test("buildCannotSelfRecord: returns true when final review and verifier share a runId", () => {
  // Build must not be able to record the final review and the
  // verifier using the same runId — that would let Build cheat
  // by self-verifying.
  const finalReview = { runId: "run-1", actor: "build" };
  const verifier = { runId: "run-1", actor: "verifier" };
  assert.equal(buildCannotSelfRecord(finalReview, verifier), true);
  // Different runIds are fine (verifier is independent).
  const okVerifier = { runId: "run-2", actor: "verifier" };
  assert.equal(buildCannotSelfRecord(finalReview, okVerifier), false);
});

test("isReady: only true when review, verifier, and CI are all clean on the same HEAD", () => {
  const standards = { head: "h", findings: [] };
  const spec = { head: "h", findings: [] };
  const verifier = { head: "h", exitCode: 0 };
  const ci = { head: "h", status: "pass" };
  assert.equal(isReady(standards, spec, verifier, ci, "h"), true);
  // CI failed: not ready.
  assert.equal(isReady(standards, spec, verifier, { head: "h", status: "fail" }, "h"), false);
  // Verifier failed: not ready.
  assert.equal(isReady(standards, spec, { head: "h", exitCode: 1 }, ci, "h"), false);
  // Review blocking: not ready.
  assert.equal(isReady(standards, { head: "h", findings: [{ kind: "blocking" }] }, verifier, ci, "h"), false);
  // HEAD moved: not ready.
  assert.equal(isReady(standards, spec, verifier, ci, "new"), false);
});

test("recordReady: stamps the ready state and the current HEAD", () => {
  const r = recordReady({ head: "abc" });
  assert.equal(r.head, "abc");
  assert.equal(r.state, "READY");
});
