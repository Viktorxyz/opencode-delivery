/*
 * Ready gate.
 *
 * The Ready gate combines three independent signals and refuses
 * any record that is not on the current HEAD:
 *
 *   1. Final review: Standards + Spec verdicts on the current
 *      HEAD (delegates to src/installer/final-review.js).
 *   2. delivery-verifier: independent verifier output (a fresh
 *      runId separate from the Build's runId).
 *   3. CI: GitHub status checks on the current HEAD.
 *
 * Build cannot self-record the final review AND the verifier
 * using the same runId — that would let Build cheat by
 * self-verifying. The boundary is enforced by
 * `buildCannotSelfRecord`; the consumer's opencode-ship config
 * must also keep the verifier in a separate permission scope
 * (the deliver-verifier agent is deny-editing).
 */

import { shouldRecordFinalReview, isReviewStale } from "./final-review.js";

export { isReviewStale, shouldRecordFinalReview };

/**
 * Stamps the verifier output and binds it to the current HEAD.
 * The verifier runs in its own runId (different from Build's)
 * and stamps the consumer's HEAD it was executed against.
 */
export function recordVerifierOutput({ head, verifierCommand, exitCode, output, runId }) {
  return {
    kind: "verifier",
    runId: runId ?? null,
    head,
    verifierCommand,
    exitCode,
    output,
    recordedAt: new Date().toISOString(),
  };
}

/**
 * The verifier is stale when the reviewed HEAD no longer matches
 * the consumer HEAD. Same rule as final review.
 */
export function isVerifierStale(verifierHead, currentHead) {
  return verifierHead !== currentHead;
}

/**
 * Build cannot self-record both the final review and the
 * verifier when the two share a runId. The check is permissive
 * about different runIds because the verifier is a separate
 * permission scope in the consumer's opencode-ship config.
 */
export function buildCannotSelfRecord(finalReview, verifier) {
  if (!finalReview?.runId || !verifier?.runId) return false;
  return finalReview.runId === verifier.runId;
}

/**
 * The Ready gate: only true when all three signals are clean on
 * the current HEAD. Standards + Spec both non-blocking, the
 * verifier exited 0, and CI is "pass" — all on the same HEAD.
 */
export function isReady(standards, spec, verifier, ci, currentHead) {
  if (!shouldRecordFinalReview(standards, spec, currentHead)) return false;
  if (!verifier || verifier.exitCode !== 0) return false;
  if (isVerifierStale(verifier.head, currentHead)) return false;
  if (!ci || ci.status !== "pass") return false;
  if (isReviewStale(ci.head, currentHead)) return false;
  return true;
}

/**
 * Stamp the Ready state on the current HEAD. The consumer's
 * opencode-ship config (or the orchestrator) calls this once
 * `isReady` returns true.
 */
export function recordReady({ head, runId }) {
  return {
    kind: "ready",
    runId: runId ?? null,
    head,
    state: "READY",
    recordedAt: new Date().toISOString(),
  };
}
