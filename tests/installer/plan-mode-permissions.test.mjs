/*
 * Unit tests for src/installer/plan-mode-permissions.js.
 *
 * The Plan Mode sub-agent has the broadest-deny-then-narrowest-allow
 * shape that opencode.js expects: deny every default permission
 * for the Build agent except the narrowest allow on
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

test("planModePermissions: returns a deny-first shape", () => {
  const perms = planModePermissions();
  // The merge is deny-first: every default Build permission is
  // deny, and the .git/opencode-ship/plans/** exception is the
  // only allow. opencode.js evaluates the LAST matching rule
  // (so a narrow allow after a broad deny creates a window).
  const block = perms.build;
  // Spot-check that core dangerous verbs are denied.
  assert.equal(block.bash, "deny");
  assert.equal(block.webfetch, "deny");
  // edit and write are object-shaped: string "deny" with one
  // narrow allow on the plans path.
  assert.equal(block.edit[".git/opencode-ship/plans/**"], "allow");
  assert.equal(block.write[".git/opencode-ship/plans/**"], "allow");
});

test("planModePermissions: places the deny block before the allow so the allow is a real exception", () => {
  // We sort the keys so the rendered JSON has the deny first,
  // then the allow. The order matters for human reviewers
  // even though opencode.js evaluates last-match.
  const block = planModePermissions().build;
  const keys = Object.keys(block);
  // Find positions of the broad deny keys and the narrow allow.
  const denyIdx = keys.indexOf("bash");
  const allowIdx = keys.findIndex((k) => typeof block[k] === "object");
  assert.ok(denyIdx >= 0);
  assert.ok(allowIdx >= 0);
  assert.ok(denyIdx < allowIdx, "deny keys must appear before the narrow allow block");
});

test("PLAN_PATH_PREFIX: matches the docs plan in the approved plan", () => {
  assert.equal(PLAN_PATH_PREFIX, ".git/opencode-ship/plans");
});

test("renderPlanModeBlock: returns a single key-value block ready for the consumer opencode.json", () => {
  const json = renderPlanModeBlock();
  // The block must be valid JSON and have the expected top-level shape.
  const parsed = JSON.parse(json);
  // Source / config / docs are denied; edit/write are objects.
  assert.equal(parsed.bash, "deny");
  assert.equal(parsed.edit[".git/opencode-ship/plans/**"], "allow");
});
