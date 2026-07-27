/**
 * delivery_pr tool.
 *
 * Opens a draft PR linked to the issue, and on each call refreshes the
 * PR body with the latest evidence. The parent agent passes the body
 * it has built; this tool only formats it and submits it.
 */

import { readManifest, writeManifest } from "../state/manifest-store.js";

export function createPrTool(deps) {
  return async function pr(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return null;
    if (!m.worktreePath) return null;
    if (m.prNumber === null) {
      const opened = await deps.driver.openDraftPullRequest({
        repo: deps.repoSlug,
        head: m.branch,
        base: m.baseBranch,
        title: input.title,
        body: input.body,
        issueNumber: m.issueNumber,
      });
      const next = {
        ...m,
        prNumber: opened.number,
        lastPrHeadSha: opened.headSha,
        state: "draft-open",
        transitionLog: [...m.transitionLog, { from: m.state, to: "draft-open", at: Date.now(), reason: "draft opened" }],
        updatedAt: new Date().toISOString(),
      };
      const path = await writeManifest(deps.repoRoot, next);
      return { contractVersion: 1, pr: opened, manifestPath: path };
    }
    await deps.driver.updatePullRequestBody({ repo: deps.repoSlug, number: m.prNumber, body: input.body });
    const refreshed = await deps.driver.refreshHead({ repo: deps.repoSlug, number: m.prNumber });
    const next = { ...m, lastPrHeadSha: refreshed };
    const path = await writeManifest(deps.repoRoot, next);
    const summary = {
      number: m.prNumber,
      url: "",
      baseRefName: m.baseBranch,
      headRefName: m.branch,
      headSha: refreshed,
      draft: true,
      mergeable: "UNKNOWN",
      mergeStateStatus: "UNKNOWN",
      merged: false,
      mergedAt: null,
    };
    return { contractVersion: 1, pr: summary, manifestPath: path };
  };
}
