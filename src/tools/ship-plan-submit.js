/**
 * ship_plan_submit tool.
 *
 * Planner-only immutable PlanV2 submission. The plan bytes go
 * through the canonical PlanV2 validator and the immutable plan
 * store so the rest of the workflow sees one record format.
 */

import { success, failure } from "./envelope.js";
import { validatePlanV2, computePlanHash } from "../workflow/plan.js";
import { publishPlanRevision } from "../workflow/plan-store.js";

const SAFE_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

export function createPlanSubmitTool(deps) {
  return async function planSubmit(input) {
    const opId = input.operationId ?? `plan-submit-${Date.now().toString(36)}`;
    const workflowId = String(input.workflowId ?? "");
    const revision = Number(input.revision);
    const plan = input.plan;
    const submittedBy = String(input.submittedBy ?? "");
    if (!workflowId || !SAFE_ID_RE.test(workflowId)) {
      return failure("plan-submit", "workflowId required (safe id)", { operationId: opId, retryable: false });
    }
    if (!Number.isInteger(revision) || revision <= 0) {
      return failure("plan-submit", "revision must be a positive integer", { operationId: opId, retryable: false });
    }
    if (!plan || typeof plan !== "object") {
      return failure("plan-submit", "plan object required", { operationId: opId, retryable: false });
    }
    const v = validatePlanV2(plan);
    if (!v.ok) {
      return failure("plan-submit", `plan validation failed: ${v.issues.join("; ")}`, { operationId: opId, retryable: false });
    }
    const expectedHash = computePlanHash(plan);
    const providedHash = String(input.sha256 ?? "");
    if (providedHash && providedHash !== expectedHash) {
      return failure("plan-submit", `sha256 mismatch (expected ${expectedHash.slice(0, 8)}, got ${providedHash.slice(0, 8)})`, { operationId: opId, retryable: false });
    }
    try {
      const result = await publishPlanRevision(deps.repoRoot, plan);
      return success("plan-submit", {
        workflowId,
        revision,
        sha256: result.hash,
        recorded: result.recorded,
      }, { operationId: opId });
    } catch (err) {
      return failure("plan-submit", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}
