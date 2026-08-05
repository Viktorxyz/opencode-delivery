/**
 * delivery_issue_close tool.
 *
 * Closes an issue. The caller MUST provide a `subject` from a
 * recorded user permission request (the controller surfaces this
 * through the OpenCode `ask` flow). The tool refuses to close
 * silently.
 */

import { success, failure } from "./envelope.js";
import { recordOperation, hasOperation } from "../state/github-operation-store.js";
import { validateGhArgv } from "../drivers/github-command-policy.js";

export function createIssueCloseTool(deps) {
  return async function issueClose(input) {
    const opId = input.operationId ?? `issue-close-${Date.now().toString(36)}`;
    const number = Number(input.number);
    const subject = String(input.subject ?? "");
    if (!Number.isInteger(number) || number <= 0) {
      return failure("issue-close", "issue number required", { operationId: opId, retryable: false });
    }
    if (subject.length === 0) {
      return failure("issue-close", "user permission subject required", { operationId: opId, retryable: false });
    }
    if (await hasOperation(deps.repoRoot, opId)) {
      return success("issue-close", { number, idempotent: true }, { operationId: opId, idempotent: true });
    }
    const argv = ["gh", "issue", "close", String(number), "--repo", deps.repoSlug, "--comment", `closed via Ship (subject=${subject})`];
    const policy = validateGhArgv(argv);
    if (!policy.ok) return failure("issue-close", policy.reason, { operationId: opId, retryable: false });
    try {
      const result = await deps.driver.runCommand(argv);
      if (result.status !== 0) {
        return failure("issue-close", `exit ${result.status}: ${result.stderr}`, { operationId: opId, retryable: false });
      }
      await recordOperation(deps.repoRoot, opId, { kind: "issue-close", ok: true, payload: { number, subject } });
      return success("issue-close", { number, subject }, { operationId: opId });
    } catch (err) {
      return failure("issue-close", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}