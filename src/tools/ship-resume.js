/**
 * ship_resume tool.
 *
 * Reconciles a workflow from durable state. Reads the plan index,
 * run record, and last event; reuses recorded child sessions
 * when present; returns the next compact action and the exact
 * resume command.
 */

import { success, failure } from "./envelope.js";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveGitCommonDir, opencodeShipStateDir } from "../state/git-common-dir.js";

export function createResumeTool(deps) {
  return async function resume(input) {
    const opId = input.operationId ?? `resume-${Date.now().toString(36)}`;
    const workflowId = String(input.workflowId ?? "");
    if (!workflowId) return failure("resume", "workflowId required", { operationId: opId, retryable: false });
    try {
      const commonDir = await resolveGitCommonDir(deps.repoRoot);
      const planRoot = join(opencodeShipStateDir(commonDir), "plans", workflowId);
      const runRoot = join(opencodeShipStateDir(commonDir), "runs", workflowId);
      const indexPath = join(planRoot, "index.json");
      if (!existsSync(indexPath)) {
        return failure("resume", "no workflow record", { operationId: opId, retryable: false });
      }
      const index = JSON.parse(await readFile(indexPath, "utf8"));
      let run = null;
      const runPath = join(runRoot, "run.json");
      if (existsSync(runPath)) {
        run = JSON.parse(await readFile(runPath, "utf8"));
      }
      const nextAction = !run ? "plan-start" : (run.state === "running" ? "task-report" : run.state);
      return success("resume", { workflowId, index, run, nextAction }, { operationId: opId });
    } catch (err) {
      return failure("resume", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}