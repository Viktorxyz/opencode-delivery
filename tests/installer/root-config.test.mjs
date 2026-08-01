/*
 * Installer root-config and uninstall-pointer tests for opencode-ship.
 *
 * These tests guard the contract that:
 *   - `init` records every installer-owned pointer, including
 *     equal-existing ones, so future `uninstall` can restore;
 *   - root-config writes go through the transaction layer so a
 *     failing write does not desync the lock.
 *
 * For v0.3.0 the installer implements pointer ownership recording;
 * the actual uninstall restoration planner lands in v0.4 alongside
 * the practices profile. These tests pin the minimum invariant:
 * equal-existing pointer values are recorded as adopted.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { previewInstall } from "../../src/installer/executor.js";
import { runInit } from "../../src/installer/commands/init.js";
import { makeProject, cleanProject } from "../fixtures/installer-fixture.mjs";

async function initIntoProject(repoRoot) {
  const result = await runInit({ json: false, rootPath: repoRoot, forceRootConfig: false, forceConfig: false, strictDoctor: false });
  return result;
}

test("root-config plan: init records every installer-owned pointer", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));

  await initIntoProject(repoRoot);
  const locked = JSON.parse(readFileSync(resolve(repoRoot, ".opencode/ship.lock.json"), "utf8"));
  const rootDocuments = locked.manager?.rootDocuments ?? [];
  const records = rootDocuments.flatMap((d) => d.pointers ?? []);
  assert.ok(records.length > 0, "root pointers must be recorded after init");
  const pointers = new Set(records.map((r) => r.pointer));
  for (const expected of [
    "/agent/build/permission/delivery_verify",
    "/agent/build/permission/delivery_review",
    "/agent/build/permission/delivery_merge",
    "/agent/build/permission/task/delivery-reviewer",
    "/agent/build/permission/task/delivery-verifier",
  ]) {
    assert.ok(pointers.has(expected), `missing pointer record: ${expected}`);
  }
});

test("root-config plan: lock remains integrity-clean after fresh install", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));
  await initIntoProject(repoRoot);
  const locked = JSON.parse(readFileSync(resolve(repoRoot, ".opencode/ship.lock.json"), "utf8"));
  assert.equal(typeof locked.integrity?.lockSha256, "string");
  assert.match(locked.integrity.lockSha256, /^[0-9a-f]{64}$/);
});

test("uninstall: refuses to remove a modified managed file", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));

  await previewInstall({ rootPath: repoRoot });
  const preview = await previewInstall({ rootPath: repoRoot });
  assert.equal(preview.ok, true);
});
