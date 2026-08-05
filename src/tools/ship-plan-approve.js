/**
 * ship_plan_approve tool.
 *
 * Seals the immutable approval record. The caller MUST provide
 * the recorded user permission subject string from the controller's
 * `ctx.ask` flow. The approval record is published immutably and
 * the workflow index is updated to `approved`.
 */

import { success, failure } from "./envelope.js";
import { writeFile, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { resolveGitCommonDir, opencodeShipStateDir } from "../state/git-common-dir.js";
import { publishImmutableJson } from "../state/durable-store.js";

export function createPlanApproveTool(deps) {
  return async function planApprove(input) {
    const opId = input.operationId ?? `plan-approve-${Date.now().toString(36)}`;
    const workflowId = String(input.workflowId ?? "");
    const revision = Number(input.revision);
    const sha256 = String(input.sha256 ?? "");
    const subject = String(input.subject ?? "");
    if (!workflowId) return failure("plan-approve", "workflowId required", { operationId: opId, retryable: false });
    if (!Number.isInteger(revision) || revision <= 0) {
      return failure("plan-approve", "revision required", { operationId: opId, retryable: false });
    }
    if (!sha256) return failure("plan-approve", "sha256 required", { operationId: opId, retryable: false });
    if (!subject) return failure("plan-approve", "user permission subject required", { operationId: opId, retryable: false });
    try {
      const commonDir = await resolveGitCommonDir(deps.repoRoot);
      const planRoot = join(opencodeShipStateDir(commonDir), "plans", workflowId);
      const revisionDir = join(planRoot, "revisions", `${String(revision).padStart(6, "0")}`);
      const planRecord = JSON.parse(await readFile(join(revisionDir, "plan.json"), "utf8"));
      if (planRecord.sha256 !== sha256) {
        return failure("plan-approve", `sha256 mismatch: plan ${planRecord.sha256.slice(0, 8)} vs approval ${sha256.slice(0, 8)}`, { operationId: opId, retryable: false });
      }
      await mkdir(revisionDir, { recursive: true });
      const approvalRecord = {
        workflowId,
        revision,
        sha256,
        approvedBy: subject,
        approvedAt: new Date().toISOString(),
        state: "approved",
      };
      await publishImmutableJson(join(revisionDir, "approval.json"), approvalRecord);
      const indexPath = join(planRoot, "index.json");
      const index = JSON.parse(await readFile(indexPath, "utf8"));
      index.state = "approved";
      index.approvedRevision = revision;
      index.approvedSha256 = sha256;
      await writeFile(indexPath, JSON.stringify(index, null, 2), "utf8");
      return success("plan-approve", { workflowId, revision, sha256, subject }, { operationId: opId });
    } catch (err) {
      return failure("plan-approve", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}