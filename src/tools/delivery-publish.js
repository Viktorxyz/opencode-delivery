/**
 * delivery_publish tool.
 *
 * The only allowed remote branch push. Verifies that the current
 * HEAD matches the expected HEAD, that the branch equals the
 * manifest's branch, and that no force flag is present. The push
 * is recorded under the operation store so a second invocation
 * with the same operationId is a no-op.
 */

import { success, failure } from "./envelope.js";
import { recordOperation, hasOperation } from "../state/github-operation-store.js";
import { readManifest } from "../state/manifest-store.js";

const FORBIDDEN_FLAGS = new Set(["--force", "-f", "--force-with-lease"]);

export function createPublishTool(deps) {
  return async function publish(input) {
    const opId = input.operationId ?? `publish-${Date.now().toString(36)}`;
    const taskId = String(input.taskId ?? "");
    const expectedHead = String(input.expectedHead ?? "");
    if (!taskId) return failure("publish", "taskId required", { operationId: opId, retryable: false });
    if (!expectedHead) return failure("publish", "expectedHead required", { operationId: opId, retryable: false });
    if (await hasOperation(deps.repoRoot, opId)) {
      return success("publish", { taskId, idempotent: true }, { operationId: opId, idempotent: true });
    }
    const manifest = await readManifest(deps.repoRoot, taskId);
    if (!manifest) return failure("publish", "no manifest for taskId", { operationId: opId, retryable: false });
    const branch = manifest.branch;
    if (!branch) return failure("publish", "manifest has no branch", { operationId: opId, retryable: false });
    const argv = ["git", "push", "origin", `HEAD:refs/heads/${branch}`];
    for (const arg of argv.slice(1)) {
      if (FORBIDDEN_FLAGS.has(arg)) {
        return failure("publish", `forbidden push flag: ${arg}`, { operationId: opId, retryable: false });
      }
    }
    try {
      const head = await deps.driver.runCommand(["git", "rev-parse", "HEAD"]);
      const currentHead = head.stdout.trim();
      if (currentHead !== expectedHead) {
        return failure("publish", `HEAD drift (expected ${expectedHead.slice(0, 8)}, got ${currentHead.slice(0, 8)})`, { operationId: opId, retryable: false });
      }
      const result = await deps.driver.runCommand(argv);
      if (result.status !== 0) {
        return failure("publish", `push failed: ${result.stderr}`, { operationId: opId, retryable: false });
      }
      await recordOperation(deps.repoRoot, opId, { kind: "publish", ok: true, payload: { taskId, branch, headSha: currentHead } });
      return success("publish", { taskId, branch, headSha: currentHead }, { operationId: opId });
    } catch (err) {
      return failure("publish", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}