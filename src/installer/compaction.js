/*
 * Compaction context builder.
 *
 * When the chat context overflows, the runtime calls
 * `buildCompactionContext` to produce the short pointer set
 * injected as the post-compaction message. The consumer can
 * then resume by reading the run dir, the plan, and the ledger
 * referenced by the pointer set. No plan body, no report body,
 * and no commit diffs ever enter the chat.
 *
 * `compactContextForRun` reads the ledger entry count from disk
 * so the consumer knows how many round-trips the current task
 * has completed.
 */

import { readCommitRanges } from "./run-store.js";
import { renderCompactContext } from "./task-brief.js";

/**
 * Build the structured object the chat hook injects. Same
 * shape as `renderCompactContext` plus a `ledgerEntryCount`
 * field that lets the resume command know how many rounds have
 * completed.
 */
export function buildCompactionContext({
  taskId,
  planHash,
  revision,
  fixRound,
  pendingGate,
  recoveryCommand,
  ledgerEntryCount,
}) {
  return {
    taskId,
    planHash,
    revision,
    fixRound,
    pendingGate,
    recoveryCommand,
    ledgerEntryCount,
  };
}

/**
 * Convenience builder that reads the ledger entry count from
 * disk and merges it with the caller-supplied pointer set. The
 * returned object is the same shape `buildCompactionContext`
 * produces; the caller may pass either form to the chat hook.
 */
export async function compactContextForRun(repoRoot, taskId, params) {
  const ranges = await readCommitRanges(repoRoot, taskId);
  return buildCompactionContext({ ...params, ledgerEntryCount: ranges.length });
}
