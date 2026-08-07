/*
 * Canonical opencode-ship tool set.
 *
 * The bundled plugin registers exactly 24 typed tools (9
 * existing delivery + 7 control-plane + 8 workflow). This module
 * is the single source of truth for the expected set so:
 *
 *   - the in-process plugin-load test asserts the contract at the
 *     plugin boundary;
 *   - the opencode-discovery smoke test asserts the contract at
 *     the runtime boundary by polling a real opencode server;
 *   - the release workflow can fail fast if a future change adds
 *     or removes a tool without updating both consumers.
 *
 * Changing this set is a contract change. Both the in-process
 * test and the live-server test must continue to agree.
 */

export const EXPECTED_OPENCODE_SHIP_TOOLS = Object.freeze([
  // 9 existing delivery tools
  "delivery_cleanup",
  "delivery_github_read",
  "delivery_inspect",
  "delivery_issue",
  "delivery_issue_close",
  "delivery_issue_comment",
  "delivery_issue_labels",
  "delivery_issue_link",
  "delivery_merge",
  "delivery_pr",
  "delivery_publish",
  "delivery_ready",
  "delivery_review",
  "delivery_sync",
  "delivery_verify",
  "delivery_worktree",
  // 7 control-plane + 8 workflow tools
  "ship_plan_approve",
  "ship_plan_start",
  "ship_plan_submit",
  "ship_resume",
  "ship_run_start",
  "ship_status",
  "ship_task_report",
  "ship_task_review",
]);

/**
 * Frozen set, sorted lexicographically. The plugin-load and
 * opencode-discovery tests both compare against this exact set.
 */
export const EXPECTED_OPENCODE_SHIP_TOOL_IDS = Object.freeze(
  [...EXPECTED_OPENCODE_SHIP_TOOLS].sort(),
);

export const OPENCODE_SHIP_TOOL_COUNT = EXPECTED_OPENCODE_SHIP_TOOLS.length;
