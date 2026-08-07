/**
 * ship_plan_start tool.
 *
 * Creates a workflow record and dispatches the configured strong
 * planner model. The workflow id is generated deterministically
 * from the issue number so resume can locate it.
 */

import { success, failure } from "./envelope.js";
import { resolveModelRoles } from "../installer/engineering-config.js";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveGitCommonDir, opencodeShipStateDir } from "../state/git-common-dir.js";

function normalizeWorkflowId(issueNumber) {
  return `wf-${issueNumber}`;
}

export function createPlanStartTool(deps) {
  return async function planStart(input) {
    const opId = input.operationId ?? `plan-start-${Date.now().toString(36)}`;
    const issueNumber = Number(input.issueNumber);
    if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
      return failure("plan-start", "issueNumber required", { operationId: opId, retryable: false });
    }
    let models;
    try {
      models = resolveModelRoles(deps.config?.workflow, { strict: true });
    } catch (err) {
      return failure("plan-start", `model roles unresolved: ${err?.message ?? err}`, { operationId: opId, retryable: false });
    }
    const workflowId = normalizeWorkflowId(issueNumber);
    const repoRoot = deps.repoRoot;
    try {
      const commonDir = await resolveGitCommonDir(repoRoot);
      const wfDir = join(opencodeShipStateDir(commonDir), "plans", workflowId);
      await mkdir(wfDir, { recursive: true });
      const indexRecord = {
        workflowId,
        issueNumber,
        owner: deps.owner,
        planner: models.planner,
        builder: models.builder,
        finalReviewer: models.finalReviewer,
        createdAt: new Date().toISOString(),
        state: "drafting",
      };
      await writeFile(join(wfDir, "index.json"), JSON.stringify(indexRecord, null, 2), "utf8");
      return success("plan-start", { workflowId, issueNumber, models: { planner: models.planner, builder: models.builder, finalReviewer: models.finalReviewer } }, { operationId: opId });
    } catch (err) {
      return failure("plan-start", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}
