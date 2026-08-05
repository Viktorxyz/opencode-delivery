/*
 * Plan Mode permission generator.
 *
 * The Plan Mode sub-agent is a thin role inside opencode.js: it
 * must be able to write plans to the Git common directory and
 * nothing else. The block is deny-first, then a narrow allow
 * on the plans path. The deny entries are real string values
 * ("deny"), and the allow entries are object values keyed by
 * the relative path:
 *
 *   {
 *     "bash": "deny",
 *     "edit": {
 *       "*": "deny",
 *       ".git/opencode-ship/plans/**": "allow"
 *     },
 *     "task": "deny"
 *   }
 *
 * opencode.js evaluates the LAST matching rule, so the broad
 * "deny" entries are the default and the narrow "allow" on
 * `.git/opencode-ship/plans/**` is the only exception. The
 * generator returns the block in this exact shape so a
 * consumer's `opencode.json` can include it under
 * `agent.plan.permission`.
 *
 * The renderPlanModeBlock helper emits a JSON-encoded string
 * suitable for direct injection into a consumer's config file.
 */

export const PLAN_PATH_PREFIX = ".git/opencode-ship/plans";

const DENY_DEFAULT = "deny";
const ALLOW_PLANS = "allow";
const PLANS_GLOB = `${PLAN_PATH_PREFIX}/**`;

/**
 * Build the Plan Mode permission object. Returned as a plain
 * object so callers can merge it into a larger config.
 */
export function planModePermissions() {
  return {
    build: {
      bash: DENY_DEFAULT,
      edit: {
        "*": DENY_DEFAULT,
        [PLANS_GLOB]: ALLOW_PLANS,
      },
      webfetch: DENY_DEFAULT,
      task: DENY_DEFAULT,
      delivery_inspect: DENY_DEFAULT,
      delivery_issue: DENY_DEFAULT,
      delivery_worktree: DENY_DEFAULT,
      delivery_verify: DENY_DEFAULT,
      delivery_review: DENY_DEFAULT,
      delivery_pr: DENY_DEFAULT,
      delivery_ready: DENY_DEFAULT,
      delivery_merge: DENY_DEFAULT,
      delivery_cleanup: DENY_DEFAULT,
    },
  };
}

/**
 * Render the Plan Mode block as a JSON-encoded string. The
 * resulting text is suitable for direct concatenation into a
 * consumer's `agent.build.permission` field. Keys are emitted
 * in deterministic order (deny first, then narrow allow) so a
 * reviewer can read the policy top-to-bottom.
 */
export function renderPlanModeBlock() {
  return JSON.stringify(planModePermissions().build, null, 2);
}
