/**
 * delivery_merge tool.
 *
 * Performs an explicit-user-request-only squash merge. Refuses if the
 * PR is not Ready, not on the configured base branch, or has a stale
 * head compared to the manifest. This tool is the ONLY entry point
 * permitted to merge a PR.
 */

import {  GithubDriver  } from "../drivers/github.ts";
import { readManifest, writeManifest } from "../state/manifest-store.ts";
import { transition } from "../state/lifecycle.js";

export const MergeDeps = {
  repoRoot: string;
  driver: GithubDriver;
  repoSlug: string;
};

export const MergeInput = {
  taskId: string;
  subject: string;
};

export const MergeError = | { kind: "missing-manifest" }
  | { kind: "missing-pr" }
  | { kind: "not-ready"; state: string }
  | { kind: "head-changed"; headSha: string; manifestSha: string }
  | { kind: "wrong-base"; base: string }
  | { kind: "not-mergeable"; reason: string };

export const MergeOutput = {
  contractVersion: 1;
  manifestPath: string;
  pr: number;
};

export function createMergeTool(deps) {
  return async function merge(input: MergeInput){
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest" };
    if (m.prNumber === null) return { kind: "missing-pr" };
    if (m.state !== "ready") return { kind: "not-ready", state: m.state };
    const pr = await deps.driver.readPullRequest({ repo, number: m.prNumber });
    if (pr.baseRefName !== m.baseBranch) return { kind: "wrong-base", base: pr.baseRefName };
    if (pr.headSha !== (m.lastPrHeadSha ?? pr.headSha)) return { kind: "head-changed", headSha, manifestSha: m.lastPrHeadSha ?? "" };
    if (pr.draft) return { kind: "not-mergeable", reason: "PR is still draft" };
    if (pr.mergeable !== "MERGEABLE") return { kind: "not-mergeable", reason: `mergeable=${pr.mergeable}` };
    const merged = await deps.driver.mergePullRequest({ repo, number, subject: input.subject });
    const t = transition({ ...m, lastPrHeadSha: merged.headSha }, "merged", { reason: `squash merged as ${input.subject}` });
    if (!t.ok) throw new Error(`lifecycle: ${t.reason}`);
    const path = await writeManifest(deps.repoRoot, { ...m, lastPrHeadSha, state, transitionLog: [...m.transitionLog, { from, to, at, reason: t.reason }], updatedAt: new Date().toISOString() });
    return { contractVersion: 1, manifestPath, pr: m.prNumber };
  };
}
