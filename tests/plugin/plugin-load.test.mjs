/*
 * Plugin loading smoke test.
 *
 * Exercises the compiled bundle against the @opencode-ai/plugin
 * runtime types without booting OpenCode. It verifies:
 *   - the bundled plugin is the default-exported function
 *   - calling it returns an object with a `tool` key
 *   - the `tool` object exposes exactly nine named tool definitions
 */

import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const pluginPath = pathToFileURL(resolve("dist/plugin.js")).href;

test("plugin: default export is a function", async () => {
  const mod = await import(pluginPath);
  assert.equal(typeof mod.default, "function");
  assert.equal(typeof mod.ShipPlugin, "function");
});

test("plugin: registers exactly nine tools", async () => {
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
  assert.deepEqual(ids, [
    "delivery_cleanup",
    "delivery_inspect",
    "delivery_issue",
    "delivery_merge",
    "delivery_pr",
    "delivery_ready",
    "delivery_review",
    "delivery_verify",
    "delivery_worktree",
  ]);
  for (const id of ids) {
    assert.equal(typeof result.tool[id].execute, "function", `${id} should expose an execute function`);
    assert.equal(typeof result.tool[id].description, "string", `${id} should expose a description`);
  }
});
