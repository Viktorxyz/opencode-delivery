/**
 * delivery_review tool.
 *
 * Records the reviewer verdict against the PR's current HEAD SHA.
 * Only `pass` verdicts update the manifest's `lastReviewerSha`; any
 * other verdict (fail / blocked / partial) leaves the SHA untouched
 * so the Ready gate cannot be satisfied until a fresh pass is observed
 * on the same SHA as the verifier and the remote CI.
 *
 * Input shape:
 *   { taskId, status, findings, envelope? }
 *
 * `envelope` is the canonical reviewer's six-section envelope. The
 * tool records the reviewer SHA only if `status === "pass"` and the
 * recorded `headSha` matches the PR's current head.
 */

import { readManifest, writeManifest } from "../state/manifest-store.js";

export function createReviewTool(deps) {
  return async function review(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
    if (m.prNumber === null) return { kind: "missing-pr" };
    if (
      m.state !== "worktree-created" &&
      m.state !== "draft-open" &&
      m.state !== "validating" &&
      m.state !== "ready"
    ) {
      return { kind: "manifest-state", state: m.state };
    }

    const prHead = await deps.driver.refreshHead({
      repo: deps.repoSlug,
      number: m.prNumber,
    });

    if (input.status !== "pass") {
      return {
        kind: "review-not-pass",
        status: input.status,
        headSha: prHead,
        recordedReviewerSha: m.lastReviewerSha ?? null,
      };
    }

    if (input.headSha && input.headSha !== prHead) {
      return {
        kind: "head-mismatch",
        reviewSha: input.headSha,
        prHeadSha: prHead,
      };
    }

    const next = {
      ...m,
      lastReviewerSha: prHead,
      transitionLog: [
        ...m.transitionLog,
        {
          from: m.state,
          to: m.state,
          at: Date.now(),
          reason: `reviewer pass at ${prHead.slice(0, 7)}`,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    const path = await writeManifest(deps.repoRoot, next);
    return {
      contractVersion: 1,
      pr: m.prNumber,
      reviewerSha: prHead,
      manifestPath: path,
    };
  };
}
