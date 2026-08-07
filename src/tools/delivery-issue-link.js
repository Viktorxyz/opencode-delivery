/**
 * delivery_issue_link tool.
 *
 * Marks a relationship between two issues by commenting on the
 * source issue with a typed "blocks/closed-by/related" marker.
 * The marker convention is documented so consumers can grep for
 * it.
 */

import { success, failure } from "./envelope.js";
import { recordOperation, hasOperation } from "../state/github-operation-store.js";
import { validateGhArgv } from "../drivers/github-command-policy.js";

const RELATIONSHIPS = new Set(["blocks", "is-blocked-by", "closes", "is-closed-by", "related"]);

export function createIssueLinkTool(deps) {
  return async function issueLink(input) {
    const opId = input.operationId ?? `issue-link-${Date.now().toString(36)}`;
    const from = Number(input.from);
    const to = Number(input.to);
    const relationship = String(input.relationship ?? "");
    if (!Number.isInteger(from) || from <= 0) return failure("issue-link", "from number required", { operationId: opId, retryable: false });
    if (!Number.isInteger(to) || to <= 0) return failure("issue-link", "to number required", { operationId: opId, retryable: false });
    if (!RELATIONSHIPS.has(relationship)) return failure("issue-link", `unknown relationship: ${relationship}`, { operationId: opId, retryable: false });
    if (await hasOperation(deps.repoRoot, opId)) {
      return success("issue-link", { from, to, relationship, idempotent: true }, { operationId: opId, idempotent: true });
    }
    const body = `<!-- opencode-ship-link:${relationship} from=${from} to=${to} -->`;
    const argv = ["gh", "issue", "comment", String(from), "--repo", deps.repoSlug, "--body", body];
    const policy = validateGhArgv(argv);
    if (!policy.ok) return failure("issue-link", policy.reason, { operationId: opId, retryable: false });
    try {
      const result = await deps.driver.runCommand(argv);
      if (result.status !== 0) {
        return failure("issue-link", `exit ${result.status}: ${result.stderr}`, { operationId: opId, retryable: false });
      }
      await recordOperation(deps.repoRoot, opId, { kind: "issue-link", ok: true, payload: { from, to, relationship } });
      return success("issue-link", { from, to, relationship }, { operationId: opId });
    } catch (err) {
      return failure("issue-link", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}
