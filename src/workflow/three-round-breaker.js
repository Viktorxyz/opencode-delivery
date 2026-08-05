/**
 * Three-round breaker.
 *
 * Each task gets at most three reviewed rounds before the
 * controller requests a new strong-model plan revision. A
 * round is one builder dispatch plus one task reviewer
 * verdict. Transport / model failures retry the same round
 * and do not count against the budget; only `fail` verdicts
 * with blocking findings consume a round.
 */

export const MAX_FAILED_ROUNDS = 3;

/**
 * @typedef {Object} RoundState
 * @property {number} round 1-indexed round number.
 * @property {"pending" | "building" | "review_pending" | "reviewing" | "fix_pending" | "completed" | "failed" | "revision_required"} state
 * @property {"pass" | "fail" | null} verdict
 * @property {string} [verdictHash]
 * @property {number} failedRounds count of fail verdicts.
 */

/**
 * @param {RoundState} state
 * @param {{ verdict: 'pass' | 'fail', verdictHash?: string }} update
 * @returns {RoundState}
 */
export function applyReviewVerdict(state, update) {
  if (update.verdict === "pass") {
    return { ...state, state: "completed", verdict: "pass", verdictHash: update.verdictHash };
  }
  const failedRounds = state.failedRounds + 1;
  if (failedRounds >= MAX_FAILED_ROUNDS) {
    return { ...state, state: "revision_required", verdict: "fail", verdictHash: update.verdictHash, failedRounds };
  }
  return { ...state, state: "fix_pending", verdict: "fail", verdictHash: update.verdictHash, failedRounds };
}

/**
 * Move the state machine into the next round after a
 * `fix_pending` verdict. The same round budget applies; the
 * breaker only fires after three fail verdicts.
 *
 * @param {RoundState} state
 * @returns {RoundState}
 */
export function advanceRound(state) {
  if (state.state === "fix_pending") {
    return { ...state, state: "building", round: state.round + 1 };
  }
  return state;
}

/**
 * Build a fresh round state for the first dispatch of a
 * task.
 *
 * @returns {RoundState}
 */
export function initialRoundState() {
  return { round: 1, state: "building", verdict: null, failedRounds: 0 };
}
