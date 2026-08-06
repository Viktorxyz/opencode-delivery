/*
 * Plugin loading smoke test.
 *
 * Exercises the compiled bundle against the @opencode-ai/plugin
 * runtime types without booting OpenCode. It verifies:
 *   - the bundled plugin is the default-exported function
 *   - calling it returns an object with a `tool` key
 *   - the `tool` object exposes exactly the 24 named tool
 *     definitions (9 delivery + 7 control-plane + 8 workflow)
 */

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const pluginPath = pathToFileURL(resolve("dist/plugin.js")).href;

const EXPECTED_TOOLS = [
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
  "ship_plan_approve",
  "ship_plan_start",
  "ship_plan_submit",
  "ship_resume",
  "ship_run_start",
  "ship_status",
  "ship_task_report",
  "ship_task_review",
];

test("plugin: default export is a function", async () => {
  const mod = await import(pluginPath);
  assert.equal(typeof mod.default, "function");
  assert.equal(typeof mod.ShipPlugin, "function");
});

test("plugin: registers exactly 24 tools", async () => {
  const mod = await import(pluginPath);
  const fakeCtx = {
    worktree: process.cwd(),
    project: { worktree: process.cwd() },
    client: {},
    directory: process.cwd(),
  };
  const result = await mod.default(fakeCtx);
  assert.ok(result.tool, "result.tool should exist");
  const ids = Object.keys(result.tool).sort();
  assert.deepEqual(ids, EXPECTED_TOOLS, `expected 24 tools, got ${ids.length}: ${ids.join(", ")}`);
  for (const id of ids) {
    assert.equal(typeof result.tool[id].execute, "function", `${id} should expose an execute function`);
    assert.equal(typeof result.tool[id].description, "string", `${id} should expose a description`);
  }
});

test("plugin: every tool returns a contract-version-2 envelope", async () => {
  const mod = await import(pluginPath);
  const fakeCtx = {
    worktree: process.cwd(),
    project: { worktree: process.cwd() },
    client: {},
    directory: process.cwd(),
  };
  const result = await mod.default(fakeCtx);
  for (const id of Object.keys(result.tool)) {
    const raw = await result.tool[id].execute({}, fakeCtx);
    const parsed = JSON.parse(raw);
    assert.equal(parsed.contractVersion, 2, `${id} must return contract-version-2 envelope`);
    assert.ok(typeof parsed.kind === "string", `${id} must include a kind`);
  }
});
