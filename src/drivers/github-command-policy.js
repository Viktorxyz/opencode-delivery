/**
 * GitHub command policy.
 *
 * The fixed allowlist of `gh` subcommands the Ship runtime
 * permits. Every authenticated GitHub mutation must go through
 * this allowlist; the policy rejects:
 *
 *   - `gh api` and any `gh *api*` variant,
 *   - extensions and aliases,
 *   - `--web` and `--body-file`,
 *   - caller-provided argv vectors (the runtime only calls
 *     the documented verbs),
 *   - shell execution (`shell: false` is enforced by the
 *     underlying `spawn`).
 *
 * The policy is the single source of truth for what counts as
 * a Ship-typed GitHub mutation. The plugin's permission table
 * mirrors the same allowlist so a model that bypasses the
 * tool surface still fails at the OpenCode permission gate.
 */

const ALLOWED_VERBS = new Set([
  "issue list",
  "issue view",
  "issue create",
  "issue comment",
  "issue edit",
  "issue close",
  "pr list",
  "pr view",
  "pr create",
  "pr edit",
  "pr checks",
  "pr ready",
  "pr merge",
]);

const FORBIDDEN_FLAGS = new Set([
  "--web",
  "--body-file",
  "--template",
]);

/**
 * @typedef {Object} GhPolicyResult
 * @property {boolean} ok
 * @property {string} [reason]
 * @property {string[]} [verb]
 */

/**
 * Validate that an argv vector is an allowed GitHub command.
 * Returns `{ ok, reason?, verb? }`. The runtime refuses to
 * spawn a `gh` process when the policy rejects the vector.
 *
 * @param {string[]} argv
 * @returns {GhPolicyResult}
 */
export function validateGhArgv(argv) {
  if (!Array.isArray(argv) || argv.length < 2) {
    return { ok: false, reason: "argv must be a non-empty array starting with the binary" };
  }
  const [bin, ...rest] = argv;
  if (bin !== "gh") {
    return { ok: false, reason: `expected 'gh' binary, got ${JSON.stringify(bin)}` };
  }
  if (rest.length === 0) {
    return { ok: false, reason: "no gh subcommand" };
  }
  // Reject extensions / aliases — gh extensions always have a
  // dash somewhere in the verb. We only allow the documented
  // two-word verbs.
  const verb = rest.slice(0, 2).join(" ");
  if (verb.includes("api")) {
    return { ok: false, reason: "gh api is not allowed (use typed Ship tools instead)" };
  }
  if (!ALLOWED_VERBS.has(verb)) {
    return { ok: false, reason: `gh subcommand not in the allowlist: ${verb}` };
  }
  for (const arg of rest.slice(2)) {
    if (FORBIDDEN_FLAGS.has(arg)) {
      return { ok: false, reason: `gh flag ${arg} is forbidden (use Ship's typed body argument instead)` };
    }
    if (typeof arg !== "string" || arg.length === 0) {
      return { ok: false, reason: "gh argv must contain only non-empty strings" };
    }
  }
  return { ok: true, verb };
}

/**
 * Return the documented allowlist. Used by tests and by the
 * plugin's permission table.
 *
 * @returns {string[]}
 */
export function allowedGhVerbs() {
  return [...ALLOWED_VERBS];
}
