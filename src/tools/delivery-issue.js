/**
 * delivery_issue tool.
 *
 * Ensures an issue exists for the task. Always idempotent: if a
 * matching open issue already exists, returns it. Always links the
 * PR to the issue via `Closes #N` on the PR body.
 */

import { createManifest, transition } from "../state/lifecycle.js";
import { writeManifest } from "../state/manifest-store.js";

export function createIssueTool(deps) {
  return async function issue(input) {
    const ensured = await deps.driver.ensureIssue({
      repo: deps.repoSlug,
      title: input.title,
      body: input.body,
      labels: input.labels,
    });
    const m = createManifest({
      taskId: input.taskId,
      repoIdentity: deps.repoSlug,
      issueNumber: ensured.summary.number,
      baseBranch: input.baseBranch,
      baseSha: input.baseSha,
      branch: input.branch,
      owner: deps.owner,
    });
    const reason = ensured.created ? "issue just created" : "issue reused";
    const t = transition(m, "issue-linked", { reason });
    if (!t.ok) throw new Error(`lifecycle: ${t.reason}`);
    const path = await writeManifest(deps.repoRoot, m);
    return {
      contractVersion: 1,
      created: ensured.created,
      issueNumber: ensured.summary.number,
      issueUrl: ensured.summary.url,
      manifestPath: path,
    };
  };
}
