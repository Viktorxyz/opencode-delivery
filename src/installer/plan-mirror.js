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
 * access. The default client is a thin wrapper around the typed
 * GitHub driver comment verb so the runtime path never uses
 * `gh api`.
 */

import { computePlanHash } from "./plan.js";

export const PLAN_COMMENT_MARKER = "opencode-ship-execution-handoff:v1";

/**
 * Plan mirror client contract.
 * @typedef {Object} PlanMirrorClient
 * @property {(owner: string, repo: string, issueNumber: number, body: string) => Promise<{url: string}>} postComment
 */

/**
 * Documented options contract for `mirrorPlanToIssue`. Exported as
 * a single JSDoc typedef so tests, scripts, and future typed
 * callers see the same shape, and the runtime can reject any
 * caller-provided key that is not in this set.
 *
 * @typedef {Object} PlanMirrorOptions
 * @property {PlanMirrorClient} client
 *   Pre-built GitHub client. The default `ghDriverClient()`
 *   wraps `createGhDriver().comment()`.
 * @property {string} owner   Repository owner.
 * @property {string} repo    Repository name (slug without owner).
 * @property {number} issueNumber  Parent issue number.
 * @property {number} [retries]  Retry attempts on transient errors.
 * @property {number} [baseBackoffMs]  Linear backoff per attempt.
 */

/**
 * Plan mirror options surface. Each entry records the documented
 * option name and its TypeScript type so callers and tests can
 * iterate the contract in one place. Adding a new option requires
 * updating this record, the JSDoc typedef, and the guard in
 * `mirrorPlanToIssue`.
 */
export const planMirrorOptions = {
  client: "function",
  owner: "string",
  repo: "string",
  issueNumber: "number",
  retries: "number",
  baseBackoffMs: "number",
};

const ALLOWED_OPTION_KEYS = new Set(Object.keys(planMirrorOptions));

/**
 * Build the body of the comment to post on the parent issue. The
 * body is JSON-stripped (no leading `{` / trailing `}`) and
 * prepended with the stable marker plus a content-addressed hash
 * so a reviewer can verify what the plan was at approval time.
 */
export function buildPlanCommentBody(plan) {
  const hash = computePlanHash(plan);
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
 * client so tests can stub the network. The default `ghDriverClient`
 * delegates to `createGhDriver().comment()`, which uses the typed
 * `gh issue comment <n> --repo <repo> --body <body>` verb.
 *
 * Retries on transient errors with linear backoff. Any option
 * that is not part of the `planMirrorOptions` contract causes the
 * call to fail closed; this keeps the mirror call site auditable.
 *
 * @param {object} plan
 * @param {Partial<PlanMirrorOptions>} options
 */
export async function mirrorPlanToIssue(plan, options) {
  if (!options) throw new Error("mirrorPlanToIssue: options object is required");
  const { client, owner, repo, issueNumber, retries = 3, baseBackoffMs = 10 } = options;
  if (!client) throw new Error("mirrorPlanToIssue: client is required");
  if (!owner || !repo || !issueNumber) {
    throw new Error("mirrorPlanToIssue: owner, repo, and issueNumber are required");
  }
  for (const key of Object.keys(options)) {
    if (!ALLOWED_OPTION_KEYS.has(key)) {
      throw new Error(`mirrorPlanToIssue: unknown option: ${key}`);
    }
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
 * Default client built from the typed GitHub driver. The driver
 * rejects `gh api` and shell interpolations, so this is the only
 * runtime path the mirror is allowed to take.
 */
export function ghDriverClient(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  /** @type {Promise<import("../drivers/gh-cli.js").GhDriver> | null} */
  let driverPromise = null;
  async function getDriver() {
    if (!driverPromise) {
      driverPromise = import("../drivers/gh-cli.js").then(({ createGhDriver }) => createGhDriver({ cwd, env }));
    }
    return driverPromise;
  }
  return {
    async postComment(owner, repo, issueNumber, body) {
      const d = await getDriver();
      await d.comment({ repo: `${owner}/${repo}`, number: issueNumber, body });
      return { url: `https://github.com/${owner}/${repo}/issues/${issueNumber}#issuecomment-mirror` };
    },
  };
}
