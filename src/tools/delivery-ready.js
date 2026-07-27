/**
 * delivery_ready tool.
 *
 * Marks the PR Ready for review only when every required gate has
 * observed the same HEAD SHA. Re-checks CI, review, and verifier
 * SHAs against the PR's current head. Never marks Ready if any gate
 * is missing, stale, pending, or failing.
 */

import { readManifest, writeManifest } from "../state/manifest-store.js";
import { transition } from "../state/lifecycle.js";
import { checkGates, gateFailureEnvelope } from "../gates.js";

export function createReadyTool(deps) {
  return async function ready(input) {
    const m = await readManifest(deps.repoRoot, input.taskId);
    if (!m) return { kind: "missing-manifest", taskId: input.taskId };
    if (m.prNumber === null) return { kind: "missing-pr" };
    const prHead = await deps.driver.refreshHead({
      repo: deps.repoSlug,
      number: m.prNumber,
    });

    const required = deps.adapter?.ready?.requires ?? [
      "review",
      "local-verification",
      "remote-ci",
    ];
    const ciDriverAvailable = Boolean(deps.adapter?.ci?.driver);
    const checks = ciDriverAvailable
      ? await deps.driver.readChecks({
          repo: deps.repoSlug,
          sha: prHead,
          required: deps.adapter?.ci?.requiredChecks ?? [],
        })
      : [];

    const result = checkGates({
      manifest: { ...m, adapter: deps.adapter },
      prHead,
      checks,
      requires: required,
    });
    if (!result.ok) {
      return gateFailureEnvelope(result);
    }

    await deps.driver.markReady({
      repo: deps.repoSlug,
      number: m.prNumber,
    });
    const t = transition(m, "ready", { reason: "all gates fresh" });
    if (!t.ok) return { kind: "lifecycle", reason: t.reason };
    const next = {
      ...m,
      lastPrHeadSha: prHead,
      state: t.to,
      transitionLog: [
        ...m.transitionLog,
        { from: t.from, to: t.to, at: t.at, reason: t.reason },
      ],
      updatedAt: new Date().toISOString(),
    };
    const path = await writeManifest(deps.repoRoot, next);
    return { contractVersion: 1, manifestPath: path, pr: m.prNumber };
  };
}
