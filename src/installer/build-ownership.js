/*
 * Build commit ownership.
 *
 * Build owns the commit for a task only after:
 *   1. the task reviewer has emitted a non-blocking Spec verdict,
 *   2. the task reviewer has emitted a non-blocking Quality
 *      verdict, AND
 *   3. an immutable review package exists on disk for the
 *      active task.
 *
 * Build never records itself as the commit owner based on a
 * missing review package. The ledger entry is the audit trail;
 * without a sealed package, the commit is the implementer's
 * (rejected by the planner) and Build refuses to own it.
 */

import { readReviewPackage, shouldCommit } from "./task-reviewer.js";
import { computePlanHash } from "./plan.js";

export { shouldCommit };

/**
 * Build owns the commit only when the review package is sealed
 * on disk AND both verdicts are non-blocking. Otherwise Build
 * has nothing to do.
 */
export async function buildOwnsCommit(repoRoot, taskId, plan, spec, quality) {
  if (!shouldCommit(spec, quality)) return false;
  const pkg = await readReviewPackage(repoRoot, taskId);
  if (!pkg) return false;
  // The plan the package is sealed against must match the
  // current plan (same hash). If it does not, Build refuses the
  // commit so a stale review does not push a changed plan.
  if (pkg.planHash !== computePlanHash(plan)) {
    return false;
  }
  return true;
}
