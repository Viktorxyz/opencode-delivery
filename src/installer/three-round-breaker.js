/*
 * Three-round breaker.
 *
 * After three failed review rounds the M3 task loop stops
 * dispatching implementer tasks and returns the plan to the GPT
 * planning role for a revision. The breaker threshold is
 * `MAX_FIX_ROUNDS`; the active fix round is `fixRound`, which
 * starts at 0 and is incremented by 1 after each failed review
 * (one round = one implementer pass + one reviewer verdict).
 *
 * The breaker is intentionally small. The GPT planning role is
 * the one authority for the plan; Build never edits the plan
 * itself. Returning to GPT is the fail-closed path.
 */

export const MAX_FIX_ROUNDS = 3;

/**
 * Returns true when the active fix round is at or past
 * `MAX_FIX_ROUNDS`. Build dispatches no further implementer
 * tasks and the run ledger records the GPT-revision request.
 */
export function shouldRequestPlanRevision(fixRound) {
  return fixRound >= MAX_FIX_ROUNDS;
}
