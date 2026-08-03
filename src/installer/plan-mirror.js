/*
 * Plan issue mirror.
 *
 * After a plan revision is approved and persisted to disk, the
 * mirror step posts the canonical plan content as a marked
 * comment on the parent issue. The marker is stable across runs
 * so a final-reviewer can find the comment and so consumers can
 * fetch the plan back from the same URL.
 *
 * The client is injectable so tests run without `gh` or network
 * access. The default client is a thin wrapper around
 * `gh api repos/<owner>/<repo>/issues/<n>/comments -f body=...`
 * (called via spawnSync in the real client).
 */

import { computePlanHash } from "./plan.js";

export const PLAN_COMMENT_MARKER = "opencode-ship-execution-handoff:v1";

/**
 * Build the body of the comment to post on the parent issue. The
 * body is JSON-stripped (no leading `{` / trailing `}`) and
 * prepended with the stable marker plus a content-addressed hash
 * so a reviewer can verify what the plan was at approval time.
 */
export function buildPlanCommentBody(plan) {
  const hash = computePlanHash(plan);
  // Drop the leading/trailing braces so the comment reads as
  // a fenced plan block, not a JSON object.
  const inner = JSON.stringify(plan, null, 2);
  const stripped = inner.startsWith("{") && inner.endsWith("}")
    ? inner.slice(1, -1)
    : inner;
  return [
    `<!-- ${PLAN_COMMENT_MARKER} plan-sha256=${hash} revision=${plan.revision} -->`,
    "",
    stripped.trim(),
    "",
  ].join("\n");
}

/**
 * Post the plan body to the parent issue. Accepts an injectable
 * client so tests can stub the network; the default client shells
 * out to `gh` and is the runtime path.
 *
 * Retries on transient errors with a small backoff (10ms steps).
 */
export async function mirrorPlanToIssue(plan, { client, owner, repo, issueNumber, retries = 3, baseBackoffMs = 10 } = {}) {
  if (!client) throw new Error("mirrorPlanToIssue: client is required");
  if (!owner || !repo || !issueNumber) {
    throw new Error("mirrorPlanToIssue: owner, repo, and issueNumber are required");
  }
  const body = buildPlanCommentBody(plan);
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      return await client.postComment(owner, repo, issueNumber, body);
    } catch (e) {
      lastErr = e;
      await new Promise((resolve) => setTimeout(resolve, baseBackoffMs * (attempt + 1)));
    }
  }
  throw lastErr ?? new Error("mirrorPlanToIssue: failed after retries");
}

/**
 * Default client that shells out to `gh` for the actual network
 * call. Constructed lazily so the test path never invokes it.
 */
export function ghClient({ gh = "gh" } = {}) {
  return {
    async postComment(owner, repo, issueNumber, body) {
      // The `gh api` call uses the default `body` field. We pass
      // the body as a string parameter (no shell interpolation).
      const { spawnSync } = await import("node:child_process");
      const r = spawnSync(
        gh,
        [
          "api",
          `repos/${owner}/${repo}/issues/${issueNumber}/comments`,
          "-f", `body=${body}`,
        ],
        { encoding: "utf8" },
      );
      if (r.status !== 0) {
        throw new Error(`gh api failed: ${(r.stderr || r.stdout || "").trim()}`);
      }
      try {
        return JSON.parse(r.stdout);
      } catch {
        return { url: `https://api.github.com/repos/${owner}/${repo}/issues/comments/unknown` };
      }
    },
  };
}
