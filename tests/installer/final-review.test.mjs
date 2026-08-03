/*
 * Unit tests for src/installer/final-review.js.
 *
 * The final review is the merge-base-to-HEAD review package
 * that the GPT Standards and Spec reviewers inspect in parallel.
 * The two axes keep their findings separate so the
 * delivery-reviewer can decide pass / fail without reranking
 * across them. The Ready gate refuses stale review, stale
 * verification, failed CI, or changed HEAD.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFinalReviewPackage,
  emitStandardsVerdict,
  emitSpecVerdict as emitFinalSpecVerdict,
  shouldRecordFinalReview,
  isReviewStale,
  READY_GATE_STATES,
} from "../../src/installer/final-review.js";

test("buildFinalReviewPackage: includes merge-base, HEAD, and the originating issue", () => {
  const pkg = buildFinalReviewPackage({
    mergeBase: "abc1234",
    head: "def5678",
    parentIssue: "Viktorxyz/opencode-ship#23",
    planHash: "deadbeef",
    taskCount: 3,
  });
  assert.equal(pkg.mergeBase, "abc1234");
  assert.equal(pkg.head, "def5678");
  assert.equal(pkg.parentIssue, "Viktorxyz/opencode-ship#23");
  assert.equal(pkg.planHash, "deadbeef");
  assert.equal(pkg.taskCount, 3);
  assert.equal(pkg.state, READY_GATE_STATES.REVIEW_IN_PROGRESS);
});

test("emitStandardsVerdict: carries the Standards axis discriminator", () => {
  const v = emitStandardsVerdict({
    head: "def5678",
    mergeBase: "abc1234",
    findings: [
      { kind: "smell", pointer: "/src/x.js", rule: "fowler:long-method", line: 42 },
    ],
  });
  assert.equal(v.standardsKind, "standards");
  assert.equal(v.findings[0].rule, "fowler:long-method");
});

test("emitFinalSpecVerdict: carries the Spec axis discriminator", () => {
  const v = emitFinalSpecVerdict({
    head: "def5678",
    mergeBase: "abc1234",
    planHash: "deadbeef",
    parentIssue: "Viktorxyz/opencode-ship#23",
    findings: [
      { kind: "blocking", pointer: "/src/y.js", reason: "acceptance criteria not met" },
    ],
  });
  assert.equal(v.specKind, "spec");
  assert.equal(v.findings[0].kind, "blocking");
});

test("shouldRecordFinalReview: pass only when both axes are non-blocking on the current HEAD", () => {
  const standards = emitStandardsVerdict({ head: "h", mergeBase: "b", findings: [] });
  const spec = emitFinalSpecVerdict({ head: "h", mergeBase: "b", planHash: "p", parentIssue: "x", findings: [] });
  assert.equal(shouldRecordFinalReview(standards, spec, "h"), true);
});

test("shouldRecordFinalReview: rejects when either axis has a blocking finding", () => {
  const standards = emitStandardsVerdict({ head: "h", mergeBase: "b", findings: [] });
  const spec = emitFinalSpecVerdict({
    head: "h", mergeBase: "b", planHash: "p", parentIssue: "x",
    findings: [{ kind: "blocking", pointer: "/y", reason: "r" }],
  });
  assert.equal(shouldRecordFinalReview(standards, spec, "h"), false);
});

test("shouldRecordFinalReview: rejects when HEAD moves between review and recording", () => {
  const standards = emitStandardsVerdict({ head: "old", mergeBase: "b", findings: [] });
  const spec = emitFinalSpecVerdict({ head: "old", mergeBase: "b", planHash: "p", parentIssue: "x", findings: [] });
  assert.equal(shouldRecordFinalReview(standards, spec, "new"), false);
});

test("isReviewStale: returns true when HEAD has advanced past the reviewed SHA", () => {
  assert.equal(isReviewStale("abc", "abc"), false);
  assert.equal(isReviewStale("abc", "def"), true);
});

test("READY_GATE_STATES: contains the documented transition set", () => {
  for (const s of [
    "REVIEW_IN_PROGRESS",
    "STANDARDS_PENDING",
    "SPEC_PENDING",
    "BOTH_PENDING",
    "BOTH_PASSED",
    "BLOCKING_FINDINGS",
    "READY",
  ]) {
    assert.ok(READY_GATE_STATES[s], `READY_GATE_STATES must include ${s}`);
  }
});
