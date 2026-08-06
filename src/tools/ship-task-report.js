/**
 * ship_task_report tool.
 *
 * Builder-only immutable report. The submittedBy must match the
 * configured builder model. The report is published immutably
 * through the controller appendRunEvent so the run ledger is
 * hash-chained and locked.
 */

import { success, failure } from "./envelope.js";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { resolveGitCommonDir, opencodeShipStateDir } from "../state/git-common-dir.js";
import { publishImmutableJson } from "../state/durable-store.js";
import { appendRunEvent, readRunState, RUN_EVENT_KINDS } from "../workflow/run-controller.js";
import { resolveModelRoles } from "../installer/engineering-config.js";

const SAFE_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

export function createTaskReportTool(deps) {
  return async function taskReport(input) {
    const opId = input.operationId ?? `task-report-${Date.now().toString(36)}`;
    const workflowId = String(input.workflowId ?? "");
    const taskId = String(input.taskId ?? "");
    const round = Number(input.round ?? 1);
    const submittedBy = String(input.submittedBy ?? "");
    const summary = String(input.summary ?? "");
    if (!workflowId || !SAFE_ID_RE.test(workflowId)) {
      return failure("task-report", "workflowId required (safe id)", { operationId: opId, retryable: false });
    }
    if (!taskId || !SAFE_ID_RE.test(taskId)) {
      return failure("task-report", "taskId required (safe id)", { operationId: opId, retryable: false });
    }
    if (!Number.isInteger(round) || round <= 0) {
      return failure("task-report", "round must be a positive integer", { operationId: opId, retryable: false });
    }
    if (!summary) return failure("task-report", "summary required", { operationId: opId, retryable: false });
    if (!submittedBy) {
      return failure("task-report", "submittedBy required (must identify builder model)", { operationId: opId, retryable: false });
    }
    let models;
    try {
      models = resolveModelRoles(deps.config?.workflow, { strict: true });
    } catch (err) {
      return failure("task-report", `builder model unresolved: ${err?.message ?? err}`, { operationId: opId, retryable: false });
    }
    if (!submittedBy.startsWith(models.builder)) {
      return failure("task-report", `submittedBy must be the configured builder model ${models.builder}`, { operationId: opId, retryable: false });
    }
    let runState;
    try {
      runState = await readRunState(deps.repoRoot, workflowId);
    } catch (err) {
      return failure("task-report", `run state unreadable: ${err?.message ?? err}`, { operationId: opId, retryable: false });
    }
    if (!runState) {
      return failure("task-report", "run not started", { operationId: opId, retryable: false });
    }
    if (runState.activeTask !== null && runState.activeTask !== taskId) {
      return failure("task-report", `another task is already active (${runState.activeTask})`, { operationId: opId, retryable: false });
    }
    try {
      const commonDir = await resolveGitCommonDir(deps.repoRoot);
      const reportDir = join(opencodeShipStateDir(commonDir), "runs", workflowId, "tasks", taskId, "rounds", `${String(round).padStart(4, "0")}`);
      await mkdir(reportDir, { recursive: true });
      const record = {
        workflowId,
        taskId,
        round,
        submittedBy,
        builder: models.builder,
        summary,
        changes: Array.isArray(input.changes) ? input.changes : [],
        tests: Array.isArray(input.tests) ? input.tests : [],
        submittedAt: new Date().toISOString(),
      };
      await publishImmutableJson(join(reportDir, "implementer-report.json"), record);
      const { state, event } = await appendRunEvent(
        deps.repoRoot,
        workflowId,
        runState,
        { kind: RUN_EVENT_KINDS.TASK_REPORT, data: { taskId, round, summary, reportHash: reportHash(record) } },
      );
      return success("task-report", { workflowId, taskId, round, state: state.state, sequence: event.sequence }, { operationId: opId });
    } catch (err) {
      return failure("task-report", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}

function reportHash(record) {
  // Used by the controller for the immutable bind; the bytes are
  // the canonical JSON of the report so a tampered report cannot
  // pass the same hash.
  const sorted = Object.keys(record).sort();
  const ordered = {};
  for (const k of sorted) ordered[k] = record[k];
  return createHash("sha256").update(JSON.stringify(ordered), "utf8").digest("hex");
}
