/**
 * delivery_sync tool.
 *
 * Fetches the configured base branch and merges it into the
 * feature branch. The merge base is recorded as the expected
 * HEAD so the controller can detect HEAD drift on the next
 * verify / Ready cycle.
 */

import { success, failure } from "./envelope.js";
import { recordOperation, hasOperation } from "../state/github-operation-store.js";
import { validateGhArgv } from "../drivers/github-command-policy.js";

export function createSyncTool(deps) {
  return async function sync(input) {
    const opId = input.operationId ?? `sync-${Date.now().toString(36)}`;
    const base = String(input.base ?? "");
    const branch = String(input.branch ?? "");
    if (!base || !branch) {
      return failure("sync", "base and branch required", { operationId: opId, retryable: false });
    }
    if (await hasOperation(deps.repoRoot, opId)) {
      return success("sync", { base, branch, idempotent: true }, { operationId: opId, idempotent: true });
    }
    const argv = ["gh", "pr", "view", "--repo", deps.repoSlug, "--json", "headRefName,baseRefName"];
    const policy = validateGhArgv(argv);
    if (!policy.ok) return failure("sync", policy.reason, { operationId: opId, retryable: false });
    try {
      const fetchResult = await deps.driver.runCommand(["git", "fetch", "origin", base]);
      if (fetchResult.status !== 0) {
        return failure("sync", `fetch failed: ${fetchResult.stderr}`, { operationId: opId, retryable: true });
      }
      const mergeResult = await deps.driver.runCommand(["git", "merge", "--no-ff", `origin/${base}`]);
      if (mergeResult.status !== 0) {
        return failure("sync", `merge failed: ${mergeResult.stderr}`, { operationId: opId, retryable: true });
      }
      const head = await deps.driver.runCommand(["git", "rev-parse", "HEAD"]);
      const headSha = head.stdout.trim();
      await recordOperation(deps.repoRoot, opId, { kind: "sync", ok: true, payload: { base, branch, headSha } });
      return success("sync", { base, branch, headSha }, { operationId: opId });
    } catch (err) {
      return failure("sync", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}
