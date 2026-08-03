/*
 * Final review package + Standards / Spec axes.
 *
 * The M3 task loop's per-task review produces Spec and Quality
 * verdicts. The final review (Task 9) inspects one committed
 * merge-base-to-HEAD package in parallel through two GPT
 * reviewers — Standards and Spec — and keeps their findings
 * separate so the delivery-reviewer can decide pass / fail
 * without reranking across axes.
 *
 * `shouldRecordFinalReview` is the gate the delivery-reviewer
 * uses to call `delivery_review`: it returns true only when both
 * axes are non-blocking on the current HEAD. `isReviewStale`
 * answers the Ready gate's "is the review still valid?" check.
 */

export const READY_GATE_STATES = Object.freeze({
  REVIEW_IN_PROGRESS: "REVIEW_IN_PROGRESS",
  STANDARDS_PENDING: "STANDARDS_PENDING",
  SPEC_PENDING: "SPEC_PENDING",
  BOTH_PENDING: "BOTH_PENDING",
  BOTH_PASSED: "BOTH_PASSED",
  BLOCKING_FINDINGS: "BLOCKING_FINDINGS",
  READY: "READY",
});

/**
 * Build the merge-base-to-HEAD review package. The two reviewers
 * read this; their findings are emitted separately. The Ready
 * gate reads `state` to decide which step of the gate flow to
 * run next.
 */
export function buildFinalReviewPackage({ mergeBase, head, parentIssue, planHash, taskCount }) {
  return {
    mergeBase,
    head,
    parentIssue,
    planHash,
    taskCount,
    state: READY_GATE_STATES.REVIEW_IN_PROGRESS,
    builtAt: new Date().toISOString(),
  };
}

function makeVerdict({ kind, kindKey, head, mergeBase, findings, discriminator, extras = {} }) {
  return {
    kind,
    kindKey,
    [discriminator]: kind,
    head,
    mergeBase,
    findings,
    emittedAt: new Date().toISOString(),
    ...extras,
  };
}

/**
 * Standards verdict. The Standards reviewer reads documented
 * repo standards plus the Fowler smell baseline; findings are
 * smell / style / performance nits, plus a small set of
 * blocking kinds (security, hardcoded-secret).
 */
export function emitStandardsVerdict({ head, mergeBase, findings = [] }) {
  return makeVerdict({ kind: "standards", kindKey: "standards", head, mergeBase, findings, discriminator: "standardsKind" });
}

/**
 * Spec verdict. The Spec reviewer reads the originating issue,
 * the approved plan, and the acceptance criteria; findings are
 * blocking (acceptance gap) or nit (clarity / naming).
 */
export function emitSpecVerdict({ head, mergeBase, planHash, parentIssue, findings = [] }) {
  return makeVerdict({
    kind: "spec",
    kindKey: "spec",
    head, mergeBase, findings,
    discriminator: "specKind",
    extras: { planHash, parentIssue },
  });
}

/**
 * Final-review gate. Pass only when both axes are non-blocking
 * AND the recorded HEAD equals the current HEAD. A change of
 * HEAD between review and recording invalidates the verdict.
 */
export function shouldRecordFinalReview(standards, spec, currentHead) {
  if (!standards || !spec) return false;
  if (standards.head !== currentHead || spec.head !== currentHead) return false;
  const standardsBlocking = (standards.findings ?? []).some(
    (f) => f.kind === "blocking" || f.kind === "security",
  );
  const specBlocking = (spec.findings ?? []).some((f) => f.kind === "blocking");
  return !standardsBlocking && !specBlocking;
}

/**
 * The review is stale when the reviewed HEAD is no longer the
 * current HEAD. The Ready gate uses this check to refuse
 * recording a delivery_review for a HEAD that has advanced
 * past the reviewed SHA.
 */
export function isReviewStale(reviewedHead, currentHead) {
  return reviewedHead !== currentHead;
}
