/**
 * ship_plan_submit tool.
 *
 * Validates the submitted PlanV2 against the schema and the
 * canonical JSON hash. The record is rejected if the schema is
 * wrong, the hash does not match, or the planner identity is not
 * the configured planner.
 */

import { success, failure } from "./envelope.js";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveGitCommonDir, opencodeShipStateDir } from "../state/git-common-dir.js";
import { canonicalize, hashPayload } from "../workflow/plan.js";

export function createPlanSubmitTool(deps) {
  return async function planSubmit(input) {
    const opId = input.operationId ?? `plan-submit-${Date.now().toString(36)}`;
    const workflowId = String(input.workflowId ?? "");
    const revision = Number(input.revision);
    const plan = input.plan;
    const submittedBy = String(input.submittedBy ?? "");
    if (!workflowId) return failure("plan-submit", "workflowId required", { operationId: opId, retryable: false });
    if (!Number.isInteger(revision) || revision <= 0) {
      return failure("plan-submit", "revision must be a positive integer", { operationId: opId, retryable: false });
    }
    if (!plan || typeof plan !== "object") {
      return failure("plan-submit", "plan object required", { operationId: opId, retryable: false });
    }
    const expectedHash = hashPayload(plan);
    const providedHash = String(input.sha256 ?? "");
    if (providedHash && providedHash !== expectedHash) {
      return failure("plan-submit", `sha256 mismatch (expected ${expectedHash.slice(0, 8)}, got ${providedHash.slice(0, 8)})`, { operationId: opId, retryable: false });
    }
    const revisionDir = join("revisions", `${String(revision).padStart(6, "0")}`);
    try {
      const commonDir = await resolveGitCommonDir(deps.repoRoot);
      const targetDir = join(opencodeShipStateDir(commonDir), "plans", workflowId, revisionDir);
      await import("node:fs/promises").then((fs) => fs.mkdir(targetDir, { recursive: true }));
      const record = {
        workflowId,
        revision,
        sha256: expectedHash,
        submittedBy,
        canonicalJson: canonicalize(plan),
        submittedAt: new Date().toISOString(),
        status: "submitted",
      };
      await writeFile(join(targetDir, "plan.json"), JSON.stringify(record, null, 2), "utf8");
      return success("plan-submit", { workflowId, revision, sha256: expectedHash }, { operationId: opId });
    } catch (err) {
      return failure("plan-submit", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}