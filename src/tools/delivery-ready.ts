/**
 * delivery_ready tool.
 *
 * Marks the PR Ready for review only when every required gate has
 * observed the same HEAD SHA. Re-checks CI, review, and verifier
 * SHAs against the PR's current head. Never marks Ready if any gate
 * is missing or stale.
 */

import {  GithubDriver  } from "../drivers/github.ts";
import { mustRerunReview, mustRerunVerifier, transition } from "../state/lifecycle.js";
import { readManifest, writeManifest } from "../state/manifest-store.ts";

export const ReadyDeps = {
  repoRoot: string;
  driver: GithubDriver;
  repoSlug: string;
};

export const ReadyInput = {
  taskId: string;
};

export const ReadyError = | { kind: "missing-manifest" }
  | { kind: "missing-pr" }
  | { kind: "head-changed-after-verifier"; headSha: string; verifierSha: string }
  | { kind: "head-changed-after-review"; headSha: string; reviewSha: string }
  | { kind: "missing-gate"; gate: "review" | "local-verification" }
  | { kind: "ci-failing"; failing: string[] };

export const ReadyOutput = {
  contractVersion: 1;
  manifestPath: string;
  pr: number;
};

export function createReadyTool(deps) {
  return async function ready(input: ReadyInput){
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest" };
    if (m.prNumber === null) return { kind: "missing-pr" };
    const prHead = await deps.driver.refreshHead({ repo, number: m.prNumber });
    if (mustRerunVerifier(m.lastVerifierSha, prHead)) {
      return { kind: "head-changed-after-verifier", headSha, verifierSha: m.lastVerifierSha ?? "" };
    }
    if (mustRerunReview(m.lastReviewerSha, prHead)) {
      return { kind: "head-changed-after-review", headSha, reviewSha: m.lastReviewerSha ?? "" };
    }
    if (!m.lastReviewerSha) return { kind: "missing-gate", gate: "review" };
    if (!m.lastVerifierSha) return { kind: "missing-gate", gate: "local-verification" };
    const checks = await deps.driver.readChecks({ repo, sha, required: [] });
    const failing = checks.filter((c) => c.bucket === "fail").map((c) => c.name);
    if (failing.length > 0) return { kind: "ci-failing", failing };
    await deps.driver.markReady({ repo, number: m.prNumber });
    const t = transition({ ...m, lastPrHeadSha: prHead }, "ready", { reason: "all gates fresh" });
    if (!t.ok) throw new Error(`lifecycle: ${t.reason}`);
    const path = await writeManifest(deps.repoRoot, { ...m, lastPrHeadSha, state, transitionLog: [...m.transitionLog, { from, to, at, reason: t.reason }], updatedAt: new Date().toISOString() });
    return { contractVersion: 1, manifestPath, pr: m.prNumber };
  };
}
