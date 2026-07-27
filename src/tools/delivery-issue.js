/**
 * delivery_issue tool.
 *
 * Ensures an issue exists for the task. Always idempotent: if a
 * matching open issue already exists, the driver returns it and we
 * reuse the manifest. Always links the PR to the issue via `Closes #N`
 * on the PR body (enforced by the gh driver).
 */

import { createManifest, transition } from "../state/lifecycle.js";
import { writeManifest } from "../state/manifest-store.js";

export function createIssueTool(deps) {
  return async function issue(input) {
    if (!input.taskId) return { kind: "missing-input", field: "taskId" };
    if (!input.title) return { kind: "missing-input", field: "title" };
    if (!input.baseBranch) return { kind: "missing-input", field: "baseBranch" };
    if (!input.branch) return { kind: "missing-input", field: "branch" };

    const ensured = await deps.driver.ensureIssue({
      repo: deps.repoSlug,
      title: input.title,
      body: input.body ?? "",
      labels: input.labels ?? [],
    });
    const m = createManifest({
      taskId: input.taskId,
      repoIdentity: deps.repoSlug,
      issueNumber: ensured.summary.number,
      baseBranch: input.baseBranch,
      baseSha: input.baseSha ?? "0000000000000000000000000000000000000000",
      branch: input.branch,
      owner: deps.owner,
      prNumber: null,
      lastPrHeadSha: null,
      lastReviewerSha: null,
      lastVerifierSha: null,
    });
    // Idempotent self-transition so re-running delivery_issue does not
    // fail when the manifest already lives in issue-linked.
    const t = transition(m, "issue-linked", {
      reason: ensured.created ? "issue just created" : "issue reused",
    });
    if (!t.ok) {
      return { kind: "lifecycle", reason: t.reason };
    }
    const next = {
      ...m,
      state: t.to,
      transitionLog: [...m.transitionLog, { from: t.from, to: t.to, at: t.at, reason: t.reason }],
      updatedAt: new Date().toISOString(),
    };
    const path = await writeManifest(deps.repoRoot, next);
    return {
      contractVersion: 1,
      created: ensured.created,
      issueNumber: ensured.summary.number,
      issueUrl: ensured.summary.url,
      manifestPath: path,
    };
  };
}
