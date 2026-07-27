/**
 * delivery_ready tool.
 *
 * Marks the PR Ready for review only when every required gate has
 * observed the same HEAD SHA. Re-checks CI, review, and verifier
 * SHAs against the PR's current head. Never marks Ready if any gate
 * is missing or stale.
 */

import { mustRerunReview, mustRerunVerifier, transition } from "../state/lifecycle.js";
import { readManifest, writeManifest } from "../state/manifest-store.js";

export function createReadyTool(deps) {
  return async function ready(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest" };
    if (m.prNumber === null) return { kind: "missing-pr" };
    const prHead = await deps.driver.refreshHead({ repo: deps.repoSlug, number: m.prNumber });
    if (mustRerunVerifier(m.lastVerifierSha, prHead)) {
      return { kind: "head-changed-after-verifier", headSha: prHead, verifierSha: m.lastVerifierSha ?? "" };
    }
    if (mustRerunReview(m.lastReviewerSha, prHead)) {
      return { kind: "head-changed-after-review", headSha: prHead, reviewSha: m.lastReviewerSha ?? "" };
    }
    if (!m.lastReviewerSha) return { kind: "missing-gate", gate: "review" };
    if (!m.lastVerifierSha) return { kind: "missing-gate", gate: "local-verification" };
    const checks = await deps.driver.readChecks({ repo: deps.repoSlug, sha: prHead, required: [] });
    const failing = checks.filter((c) => c.bucket === "fail").map((c) => c.name);
    if (failing.length > 0) return { kind: "ci-failing", failing };
    await deps.driver.markReady({ repo: deps.repoSlug, number: m.prNumber });
    const t = transition({ ...m, lastPrHeadSha: prHead }, "ready", { reason: "all gates fresh" });
    if (!t.ok) throw new Error(`lifecycle: ${t.reason}`);
    const next = {
      ...m,
      lastPrHeadSha: prHead,
      state: t.to,
      transitionLog: [...m.transitionLog, { from: t.from, to: t.to, at: t.at, reason: t.reason }],
      updatedAt: new Date().toISOString(),
    };
    const path = await writeManifest(deps.repoRoot, next);
    return { contractVersion: 1, manifestPath: path, pr: m.prNumber };
  };
}
