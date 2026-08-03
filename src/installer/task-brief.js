/*
 * Task brief + compact context renderer.
 *
 * The M3 task loop extracts the active task from a multi-task
 * plan and presents it as a single-task brief. The compact
 * context renderer emits the short pointer set that the
 * compaction hook injects into chat after a context overflow;
 * the actual plan, ledger, and reports are referenced by path
 * and hash, never inlined.
 */

import { computePlanHash } from "./plan.js";

/**
 * Extract the active task slice from a plan plus the plan header
 * the runtime needs to keep the brief self-contained. Throws when
 * the active task is not in the plan; the planner must catch that
 * before reaching the task loop.
 */
export function buildTaskBrief(plan, activeTaskId) {
  if (!plan || !Array.isArray(plan.tasks)) {
    throw new Error(`buildTaskBrief: invalid plan`);
  }
  const task = plan.tasks.find((t) => t && t.id === activeTaskId);
  if (!task) {
    throw new Error(`buildTaskBrief: task "${activeTaskId}" is not in the plan`);
  }
  return {
    activeTaskId: task.id,
    parentIssue: plan.parentIssue,
    baseSha: plan.baseSha,
    revision: plan.revision,
    description: task.description,
    interfaces: task.interfaces ?? [],
    testSeams: task.testSeams ?? [],
    commands: task.commands ?? [],
    expectedEvidence: task.expectedEvidence ?? null,
    planHash: computePlanHash(plan),
  };
}

/**
 * Emit the short pointer set the compaction hook injects into
 * chat after a context overflow. Every field is a path or hash
 * reference; the full plan, ledger, and reports are never
 * inlined.
 */
export function renderCompactContext({
  taskId,
  planHash,
  revision,
  fixRound,
  pendingGate,
  recoveryCommand,
}) {
  const lines = [
    `task-id=${taskId}`,
    `plan-hash=${planHash}`,
    `revision=${revision}`,
    `fix-round=${fixRound}`,
    `pending-gate=${pendingGate}`,
    `recovery=${recoveryCommand}`,
  ];
  return lines.join("\n");
}
