/*
 * Build-side commit binding.
 *
 * After a review package is sealed and both verdicts are
 * non-blocking, Build owns the commit. recordApprovedCommit
 * appends the immutable range to the run ledger so a later
 * audit can map the head SHA back to its review package.
 *
 * The ledger is append-only; the store rejects duplicate from-sha
 * (use the previous range's `to` for chained commits).
 */

export { recordCommitRange as recordApprovedCommit } from "./run-store.js";
