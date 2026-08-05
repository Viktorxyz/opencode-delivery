/**
 * delivery_github_read tool.
 *
 * Typed read of GitHub issues, PRs, and status checks. Writes a
 * contract-version-2 envelope and records the operation under the
 * GitHub operation store for idempotency.
 */

import { success, failure } from "./envelope.js";
import { recordOperation, hasOperation } from "../state/github-operation-store.js";
import { validateGhArgv } from "../drivers/github-command-policy.js";

export function createGithubReadTool(deps) {
  return async function githubRead(input) {
    const opId = input.operationId ?? `gh-read-${Date.now().toString(36)}`;
    const resource = String(input.resource ?? "");
    const repo = deps.repoSlug;
    const number = Number(input.number);
    if (!repo) return failure("github-read", "repo slug missing", { operationId: opId, retryable: false });
    if (!["issue", "pr", "checks"].includes(resource)) {
      return failure("github-read", `unknown resource: ${resource}`, { operationId: opId, retryable: false });
    }
    if (resource !== "checks" && (!Number.isInteger(number) || number <= 0)) {
      return failure("github-read", "issue/PR number required", { operationId: opId, retryable: false });
    }
    if (await hasOperation(deps.repoRoot, opId)) {
      const prior = await deps.operationStore.readOperation(deps.repoRoot, opId).catch(() => null);
      if (prior && prior.ok) return success("github-read", prior.payload, { operationId: opId, idempotent: true });
    }
    let argv;
    if (resource === "issue") {
      argv = ["gh", "issue", "view", String(number), "--repo", repo, "--json", "number,title,state,body,url"];
    } else if (resource === "pr") {
      argv = ["gh", "pr", "view", String(number), "--repo", repo, "--json", "number,url,state,headRefOid,isDraft"];
    } else {
      const sha = input.sha ? String(input.sha) : null;
      if (!sha) return failure("github-read", "sha required for checks", { operationId: opId, retryable: false });
      argv = ["gh", "pr", "checks", String(number), "--repo", repo, "--json", "name,state,conclusion"];
    }
    const policy = validateGhArgv(argv);
    if (!policy.ok) return failure("github-read", policy.reason, { operationId: opId, retryable: false });
    try {
      const result = await deps.driver.runCommand(argv);
      if (result.status !== 0) {
        return failure("github-read", `exit ${result.status}: ${result.stderr}`, { operationId: opId, retryable: false });
      }
      const payload = JSON.parse(result.stdout || "{}");
      await recordOperation(deps.repoRoot, opId, { kind: "github-read", ok: true, payload });
      return success("github-read", { resource, number, payload }, { operationId: opId });
    } catch (err) {
      return failure("github-read", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}