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
 *     "bash":  "deny",
 *     "edit":  { ".git/opencode-ship/plans/**": "allow" },
 *     "write": { ".git/opencode-ship/plans/**": "allow" },
 *     ...
 *   }
 *
 * opencode.js evaluates the LAST matching rule, so the broad
 * "deny" entries are the default and the narrow "allow" on
 * `.git/opencode-ship/plans/**` is the only exception. The
 * generator returns the block in this exact shape so a
 * consumer's `opencode.json` can include it under
 * `agent.build.permission`.
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
      // Broad-deny entries for the standard Build verbs. These
      // cover bash, source edits, and writes outside the plans
      // path. opencode.js evaluates the last matching rule, so
      // a narrow object-typed entry after a string-typed deny
      // creates a per-path exception.
      bash: DENY_DEFAULT,
      edit: { [PLANS_GLOB]: ALLOW_PLANS },
      write: { [PLANS_GLOB]: ALLOW_PLANS },
      webfetch: DENY_DEFAULT,
      // The Plan Mode sub-agent also has no business calling
      // delivery tools itself; that is the Build controller's
      // job. Keep the canonical nine tools as deny so a Plan
      // Mode prompt injection cannot trigger them.
      "task.plan-agent": DENY_DEFAULT,
      "task.build-agent": DENY_DEFAULT,
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
