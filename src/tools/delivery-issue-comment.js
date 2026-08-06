/**
 * delivery_issue_comment tool.
 *
 * Idempotent typed comment on an issue. The operationId allow
 * repetition; the same operationId is rejected by the operation
 * store and returns the previously recorded payload.
 */

import { success, failure } from "./envelope.js";
import { recordOperation, hasOperation } from "../state/github-operation-store.js";
import { validateGhArgv } from "../drivers/github-command-policy.js";

export function createIssueCommentTool(deps) {
  return async function issueComment(input) {
    const opId = input.operationId ?? `issue-comment-${Date.now().toString(36)}`;
    const number = Number(input.number);
    const body = String(input.body ?? "");
    if (!Number.isInteger(number) || number <= 0) {
      return failure("issue-comment", "issue number required", { operationId: opId, retryable: false });
    }
    if (body.length === 0) {
      return failure("issue-comment", "comment body required", { operationId: opId, retryable: false });
    }
    if (await hasOperation(deps.repoRoot, opId)) {
      return success("issue-comment", { number, idempotent: true }, { operationId: opId, idempotent: true });
    }
    const argv = ["gh", "issue", "comment", String(number), "--repo", deps.repoSlug, "--body", body];
    const policy = validateGhArgv(argv);
    if (!policy.ok) return failure("issue-comment", policy.reason, { operationId: opId, retryable: false });
    try {
      const result = await deps.driver.runCommand(argv);
      if (result.status !== 0) {
        return failure("issue-comment", `exit ${result.status}: ${result.stderr}`, { operationId: opId, retryable: false });
      }
      await recordOperation(deps.repoRoot, opId, { kind: "issue-comment", ok: true, payload: { number } });
      return success("issue-comment", { number }, { operationId: opId });
    } catch (err) {
      return failure("issue-comment", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}