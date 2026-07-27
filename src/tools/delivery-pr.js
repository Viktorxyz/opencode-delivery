/**
 * delivery_pr tool.
 *
 * Opens a draft PR linked to the issue on first call. Subsequent calls
 * refresh the PR body, but always preserve the canonical
 * `Closes #N` reference (and any other persistent footer lines) so
 * the PR never silently drops its link to the originating issue.
 */

import { readManifest, writeManifest } from "../state/manifest-store.js";
import { transition } from "../state/lifecycle.js";

function preserveClosingReference(existingBody, issueNumber) {
  if (!existingBody) return null;
  const match = existingBody.match(/Closes\s+#(\d+)/i);
  if (match) {
    if (match[1] === String(issueNumber)) return existingBody;
    return existingBody.replace(/Closes\s+#\d+/i, `Closes #${issueNumber}`);
  }
  return `${existingBody}\n\nCloses #${issueNumber}`;
}

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

    // Refresh path: keep the existing `Closes #N` line on the new body.
    const existingPr = await deps.driver.readPullRequest({
      repo: deps.repoSlug,
      number: m.prNumber,
    });
    const mergedBody = preserveClosingReference(
      input.body,
      m.issueNumber,
    ) ?? input.body;

    await deps.driver.updatePullRequestBody({
      repo: deps.repoSlug,
      number: m.prNumber,
      body: mergedBody,
    });
    const refreshed =
      typeof existingPr?.headSha === "string" && existingPr.headSha
        ? existingPr.headSha
        : await deps.driver.refreshHead({ repo: deps.repoSlug, number: m.prNumber });
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
        url: existingPr?.url ?? "",
        baseRefName: existingPr?.baseRefName ?? m.baseBranch,
        headRefName: existingPr?.headRefName ?? m.branch,
        headSha: refreshed,
        draft: existingPr?.draft ?? true,
        mergeable: existingPr?.mergeable ?? "UNKNOWN",
        mergeStateStatus: existingPr?.mergeStateStatus ?? "UNKNOWN",
        merged: existingPr?.merged ?? false,
        mergedAt: existingPr?.mergedAt ?? null,
      },
      manifestPath: path,
    };
  };
}
