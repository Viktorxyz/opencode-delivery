/*
 * Unit tests for src/installer/plan-mode-permissions.js.
 *
 * The Plan Mode sub-agent has the broadest-deny-then-narrowest-allow
 * shape that opencode.js expects: deny every default permission
 * for the Plan agent except the narrowest allow on
 * `.git/opencode-ship/plans/**`. Tests assert the merge shape
 * (deny-wins, allow is a narrow exception) and the consumer
 * can read this back from the rendered config.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  planModePermissions,
  renderPlanModeBlock,
  PLAN_PATH_PREFIX,
} from "../../src/installer/plan-mode-permissions.js";

const PLANS_GLOB = `${PLAN_PATH_PREFIX}/**`;

test("planModePermissions: returns a deny-first shape", () => {
  const perms = planModePermissions();
  const block = perms.build;
  assert.equal(block.bash, "deny");
  assert.equal(block.webfetch, "deny");
  assert.equal(block.task, "deny");
  for (const tool of [
    "delivery_inspect",
    "delivery_issue",
    "delivery_worktree",
    "delivery_verify",
    "delivery_review",
    "delivery_pr",
    "delivery_ready",
    "delivery_merge",
    "delivery_cleanup",
  ]) {
    assert.equal(block[tool], "deny", `${tool} must be denied in Plan Mode`);
  }
  assert.equal(block.edit["*"], "deny", "all edit paths must be denied by default");
  assert.equal(block.edit[PLANS_GLOB], "allow", "plans path must be the only edit allow");
});

test("planModePermissions: places the deny block before the allow so the allow is a real exception", () => {
  const block = planModePermissions().build;
  const keys = Object.keys(block);
  const denyIdx = keys.indexOf("bash");
  const allowIdx = keys.findIndex((k) => k === "edit");
  assert.ok(denyIdx >= 0);
  assert.ok(allowIdx > denyIdx, "edit permission block must appear after the broad deny");
});

test("PLAN_PATH_PREFIX: matches the docs plan in the approved plan", () => {
  assert.equal(PLAN_PATH_PREFIX, ".git/opencode-ship/plans");
});

test("renderPlanModeBlock: returns a single key-value block ready for the consumer opencode.json", () => {
  const json = renderPlanModeBlock();
  const parsed = JSON.parse(json);
  assert.equal(parsed.bash, "deny");
  assert.equal(parsed.edit["*"], "deny");
  assert.equal(parsed.edit[PLANS_GLOB], "allow");
});
