/**
 * delivery_pr tool.
 *
 * Opens a draft PR linked to the issue, and on each call refreshes the
 * PR body with the latest evidence. The parent agent passes the body
 * it has built; this tool only formats it and submits it.
 */

import {  GithubDriver, PullRequestSummary  } from "../drivers/github.ts";
import { readManifest, writeManifest } from "../state/manifest-store.ts";

export const PrDeps = {
  repoRoot: string;
  driver: GithubDriver;
  repoSlug: string;
};

export const PrInput = {
  taskId: string;
  title: string;
  body: string;
};

export const PrOutput = {
  contractVersion: 1;
  pr: PullRequestSummary;
  manifestPath: string;
};

export function createPrTool(deps) {
  return async function pr(input: PrInput){
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return null;
    if (!m.worktreePath) return null;
    if (m.prNumber === null) {
      const opened = await deps.driver.openDraftPullRequest({
        repo,
        head,
        base,
        title,
        body,
        issueNumber,
      });
      const next = { ...m, prNumber, lastPrHeadSha, state: "draft-open": [...m.transitionLog, { from, to: "draft-open": Date.now(), reason: "draft opened" }], updatedAt: new Date().toISOString() };
      const path = await writeManifest(deps.repoRoot, next);
      return { contractVersion: 1, pr, manifestPath: path };
    }
    await deps.driver.updatePullRequestBody({ repo, number, body: input.body });
    const refreshed = await deps.driver.refreshHead({ repo, number: m.prNumber });
    const next = { ...m, lastPrHeadSha: refreshed };
    const path = await writeManifest(deps.repoRoot, next);
    const summary= {
      number,
      url: "",
      baseRefName,
      headRefName,
      headSha,
      draft,
      mergeable: "UNKNOWN",
      mergeStateStatus: "UNKNOWN",
      merged,
      mergedAt,
    };
    return { contractVersion: 1, pr, manifestPath: path };
  };
}
