/**
 * delivery_merge tool.
 *
 * Performs an explicit-user-request-only squash merge. Refuses if the
 * PR is not Ready, not on the configured base branch, or has a stale
 * head compared to the manifest. This tool is the ONLY entry point
 * permitted to merge a PR.
 */

import { readManifest, writeManifest } from "../state/manifest-store.js";
import { transition } from "../state/lifecycle.js";

export function createMergeTool(deps) {
  return async function merge(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest" };
    if (m.prNumber === null) return { kind: "missing-pr" };
    if (m.state !== "ready") return { kind: "not-ready", state: m.state };
    const pr = await deps.driver.readPullRequest({ repo: deps.repoSlug, number: m.prNumber });
    if (pr.baseRefName !== m.baseBranch) return { kind: "wrong-base", base: pr.baseRefName };
    const expectedHead = m.lastPrHeadSha ?? pr.headSha;
    if (pr.headSha !== expectedHead) return { kind: "head-changed", headSha: pr.headSha, manifestSha: m.lastPrHeadSha ?? "" };
    if (pr.draft) return { kind: "not-mergeable", reason: "PR is still draft" };
    if (pr.mergeable !== "MERGEABLE") return { kind: "not-mergeable", reason: `mergeable=${pr.mergeable}` };
    const merged = await deps.driver.mergePullRequest({ repo: deps.repoSlug, number: m.prNumber, subject: input.subject });
    const t = transition({ ...m, lastPrHeadSha: merged.headSha }, "merged", { reason: `squash merged as ${input.subject}` });
    if (!t.ok) throw new Error(`lifecycle: ${t.reason}`);
    const next = {
      ...m,
      lastPrHeadSha: merged.headSha,
      state: t.to,
      transitionLog: [...m.transitionLog, { from: t.from, to: t.to, at: t.at, reason: t.reason }],
      updatedAt: new Date().toISOString(),
    };
    const path = await writeManifest(deps.repoRoot, next);
    return { contractVersion: 1, manifestPath: path, pr: m.prNumber };
  };
}
