/**
 * ship_run_start tool.
 *
 * Starts execution of an approved plan. Reads the approved
 * revision, validates the latest plan hash matches the approval,
 * and creates the run ledger directory.
 */

import { success, failure } from "./envelope.js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { resolveGitCommonDir, opencodeShipStateDir } from "../state/git-common-dir.js";

export function createRunStartTool(deps) {
  return async function runStart(input) {
    const opId = input.operationId ?? `run-start-${Date.now().toString(36)}`;
    const workflowId = String(input.workflowId ?? "");
    if (!workflowId) return failure("run-start", "workflowId required", { operationId: opId, retryable: false });
    try {
      const commonDir = await resolveGitCommonDir(deps.repoRoot);
      const planRoot = join(opencodeShipStateDir(commonDir), "plans", workflowId);
      const index = JSON.parse(await readFile(join(planRoot, "index.json"), "utf8"));
      if (index.state !== "approved") {
        return failure("run-start", `workflow state is ${index.state}, not approved`, { operationId: opId, retryable: false });
      }
      const revision = index.approvedRevision;
      const sha256 = index.approvedSha256;
      const runDir = join(opencodeShipStateDir(commonDir), "runs", workflowId);
      await mkdir(join(runDir, "events"), { recursive: true });
      const runRecord = {
        workflowId,
        revision,
        sha256,
        startedAt: new Date().toISOString(),
        state: "running",
        activeTask: null,
        round: 0,
      };
      await writeFile(join(runDir, "run.json"), JSON.stringify(runRecord, null, 2), "utf8");
      const event = { sequence: 1, kind: "run-start", at: runRecord.startedAt, data: { revision, sha256 } };
      await writeFile(join(runDir, "events", "00000001.json"), JSON.stringify(event, null, 2), "utf8");
      return success("run-start", { workflowId, revision, sha256 }, { operationId: opId });
    } catch (err) {
      return failure("run-start", String(err?.message ?? err), { operationId: opId, retryable: true });
    }
  };
}