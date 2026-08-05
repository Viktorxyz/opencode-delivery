/**
 * ship_task_review tool.
 *
 * Task-reviewer verdict with explicit Spec and Quality axes. The
 * caller must supply both axes; the tool refuses to record a
 * combined verdict. The verdict is published immutably and the
 * run ledger advances to either `commit-pending` (both pass) or
 * `fix-pending` (either fails).
 */

import { success, failure } from "./envelope.js";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveGitCommonDir, opencodeShipStateDir } from "../state/git-common-dir.js";
import { publishImmutableJson } from "../state/durable-store.js";

const PASS_VALUES = new Set(["pass", "none"]);

export function createTaskReviewTool(deps) {
  return async function taskReview(input) {
    const opId = input.operationId ?? `task-review-${Date.now().toString(36)}`;
    const workflowId = String(input.workflowId ?? "");
    const taskId = String(input.taskId ?? "");
    const round = Number(input.round ?? 1);
    const spec = input.spec;
    const quality = input.quality;
    const submittedBy = String(input.submittedBy ?? "");
    if (!workflowId) return failure("task-review", "workflowId required", { operationId: opId, retryable: false });
    if (!taskId) return failure("task-review", "taskId required", { operationId: opId, retryable: false });
    if (!Number.isInteger(round) || round <= 0) {
      return failure("task-review", "round must be a positive integer", { operationId: opId, retryable: false });
    }
    if (!spec || typeof spec !== "object" || !PASS_VALUES.has(String(spec.verdict ?? ""))) {
      return failure("task-review", "spec verdict required (pass|none)", { operationId: opId, retryable: false });
    }
    if (!quality || typeof quality !== "object" || !PASS_VALUES.has(String(quality.verdict ?? ""))) {
      return failure("task-review", "quality verdict required (pass|none)", { operationId: opId, retryable: false });
    }
    try {
      const commonDir = await resolveGitCommonDir(deps.repoRoot);
      const reviewDir = join(opencodeShipStateDir(commonDir), "runs", workflowId, "tasks", taskId, "rounds", `${String(round).padStart(4, "0")}`);
      await mkdir(reviewDir, { recursive: true });
      const specPass = String(spec.verdict) === "pass";
      const qualityPass = String(quality.verdict) === "pass";
      const state = specPass && qualityPass ? "commit-pending" : "fix-pending";
      const record = {
        workflowId,
        taskId,
        round,
        submittedBy,
        spec,
        quality,
        state,
        reviewedAt: new Date().toISOString(),
      };
      await publishImmutableJson(join(reviewDir, "review.json"), record);
      const runPath = join(opencodeShipStateDir(commonDir), "runs", workflowId, "run.json");
      const run = JSON.parse(await readFile(runPath, "utf8"));
      run.activeTask = state === "commit-pending" ? taskId : null;
      run.round = state === "commit-pending" ? round : round + 1;
      run.state = state;
      await writeFile(runPath, JSON.stringify(run, null, 2), "utf8");
      return success("task-review", { workflowId, taskId, round, state }, { operationId: opId });
    } catch (err) {
      return failure("task-review", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}