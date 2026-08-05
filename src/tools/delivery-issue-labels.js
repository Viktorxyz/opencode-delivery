/**
 * delivery_issue_labels tool.
 *
 * Idempotent label reconciliation. Both add and remove lists are
 * applied in one command, then the operation is recorded so a
 * second invocation with the same operationId is a no-op.
 */

import { success, failure } from "./envelope.js";
import { recordOperation, hasOperation } from "../state/github-operation-store.js";
import { validateGhArgv } from "../drivers/github-command-policy.js";

export function createIssueLabelsTool(deps) {
  return async function issueLabels(input) {
    const opId = input.operationId ?? `issue-labels-${Date.now().toString(36)}`;
    const number = Number(input.number);
    const add = Array.isArray(input.add) ? input.add : [];
    const remove = Array.isArray(input.remove) ? input.remove : [];
    if (!Number.isInteger(number) || number <= 0) {
      return failure("issue-labels", "issue number required", { operationId: opId, retryable: false });
    }
    if (add.length === 0 && remove.length === 0) {
      return failure("issue-labels", "add or remove list required", { operationId: opId, retryable: false });
    }
    if (await hasOperation(deps.repoRoot, opId)) {
      return success("issue-labels", { number, idempotent: true }, { operationId: opId, idempotent: true });
    }
    const attempted = [];
    for (const label of add) {
      const argv = ["gh", "issue", "edit", String(number), "--repo", deps.repoSlug, "--add-label", label];
      const policy = validateGhArgv(argv);
      if (!policy.ok) return failure("issue-labels", policy.reason, { operationId: opId, retryable: false });
      attempted.push({ action: "add", label });
    }
    for (const label of remove) {
      const argv = ["gh", "issue", "edit", String(number), "--repo", deps.repoSlug, "--remove-label", label];
      const policy = validateGhArgv(argv);
      if (!policy.ok) return failure("issue-labels", policy.reason, { operationId: opId, retryable: false });
      attempted.push({ action: "remove", label });
    }
    try {
      for (const { action, label } of attempted) {
        const flag = action === "add" ? "--add-label" : "--remove-label";
        const result = await deps.driver.runCommand(["gh", "issue", "edit", String(number), "--repo", deps.repoSlug, flag, label]);
        if (result.status !== 0) {
          return failure("issue-labels", `${action} ${label} failed: ${result.stderr}`, { operationId: opId, retryable: false });
        }
      }
      await recordOperation(deps.repoRoot, opId, { kind: "issue-labels", ok: true, payload: { number, add, remove } });
      return success("issue-labels", { number, add, remove }, { operationId: opId });
    } catch (err) {
      return failure("issue-labels", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}