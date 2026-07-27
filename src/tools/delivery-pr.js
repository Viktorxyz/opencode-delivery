/**
 * delivery_pr tool.
 *
 * Opens a draft PR linked to the issue on first call. Subsequent calls
 * refresh the PR body with the latest evidence (test summary, latest
 * verifier SHA, etc.) and re-read the head SHA from the GitHub driver.
 */

import { readManifest, writeManifest } from "../state/manifest-store.js";
import { transition } from "../state/lifecycle.js";

export function createPrTool(deps) {
  return async function pr(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
    if (m.state !== "worktree-created" && m.state !== "draft-open") {
      return { kind: "manifest-state", state: m.state };
    }

    if (m.prNumber === null) {
      const opened = await deps.driver.openDraftPullRequest({
        repo: deps.repoSlug,
        head: m.branch,
        base: m.baseBranch,
        title: input.title,
        body: input.body,
        issueNumber: m.issueNumber,
      });
      const t = transition(m, "draft-open", { reason: "draft opened" });
      if (!t.ok) return { kind: "lifecycle", reason: t.reason };
      const next = {
        ...m,
        prNumber: opened.number,
        lastPrHeadSha: opened.headSha,
        state: t.to,
        transitionLog: [
          ...m.transitionLog,
          { from: t.from, to: t.to, at: t.at, reason: t.reason },
        ],
        updatedAt: new Date().toISOString(),
      };
      const path = await writeManifest(deps.repoRoot, next);
      return { contractVersion: 1, pr: opened, manifestPath: path };
    }

    await deps.driver.updatePullRequestBody({
      repo: deps.repoSlug,
      number: m.prNumber,
      body: input.body,
    });
    const refreshed = await deps.driver.refreshHead({
      repo: deps.repoSlug,
      number: m.prNumber,
    });
    const next = {
      ...m,
      lastPrHeadSha: refreshed,
      transitionLog: [
        ...m.transitionLog,
        {
          from: m.state,
          to: m.state,
          at: Date.now(),
          reason: `pr body updated (head ${refreshed.slice(0, 7)})`,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    const path = await writeManifest(deps.repoRoot, next);
    return {
      contractVersion: 1,
      pr: {
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
      },
      manifestPath: path,
    };
  };
}
