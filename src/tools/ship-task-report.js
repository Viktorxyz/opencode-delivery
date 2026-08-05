/**
 * ship_task_report tool.
 *
 * Builder-only immutable report. The submittedBy must match the
 * configured builder model. The report is published immutably and
 * the run ledger advances.
 */

import { success, failure } from "./envelope.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveGitCommonDir, opencodeShipStateDir } from "../state/git-common-dir.js";
import { publishImmutableJson } from "../state/durable-store.js";
import { resolveModelRoles } from "../installer/engineering-config.js";

export function createTaskReportTool(deps) {
  return async function taskReport(input) {
    const opId = input.operationId ?? `task-report-${Date.now().toString(36)}`;
    const workflowId = String(input.workflowId ?? "");
    const taskId = String(input.taskId ?? "");
    const round = Number(input.round ?? 1);
    const submittedBy = String(input.submittedBy ?? "");
    const summary = String(input.summary ?? "");
    if (!workflowId) return failure("task-report", "workflowId required", { operationId: opId, retryable: false });
    if (!taskId) return failure("task-report", "taskId required", { operationId: opId, retryable: false });
    if (!Number.isInteger(round) || round <= 0) {
      return failure("task-report", "round must be a positive integer", { operationId: opId, retryable: false });
    }
    if (!summary) return failure("task-report", "summary required", { operationId: opId, retryable: false });
    let models;
    try {
      models = resolveModelRoles(deps.config?.workflow, { strict: true });
    } catch (err) {
      return failure("task-report", `builder model unresolved: ${err?.message ?? err}`, { operationId: opId, retryable: false });
    }
    if (submittedBy && !submittedBy.startsWith(models.builder)) {
      return failure("task-report", `submittedBy must match builder model ${models.builder}`, { operationId: opId, retryable: false });
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
      const runPath = join(opencodeShipStateDir(commonDir), "runs", workflowId, "run.json");
      const run = JSON.parse(await readFile(runPath, "utf8"));
      run.activeTask = taskId;
      run.round = round;
      await writeFile(runPath, JSON.stringify(run, null, 2), "utf8");
      return success("task-report", { workflowId, taskId, round }, { operationId: opId });
    } catch (err) {
      return failure("task-report", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}