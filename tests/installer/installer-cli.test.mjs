/*
 * Installer smoke tests: init / diff / update / uninstall / doctor /
 * idempotency / conflict / uninstall preserves user files.
 *
 * The CLI is invoked by spawning the built `dist/cli.js` against a
 * temporary Git repository created via `tests/fixtures/installer-fixture.mjs`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { makeProject, cleanProject, writeFileTo } from "../fixtures/installer-fixture.mjs";

const CLI = resolve("dist/cli.js");
const PKG_ROOT = resolve(".");

function cli(repoRoot, args) {
  const r = spawnSync("node", [CLI, ...args, "--root", repoRoot, "--json"], { encoding: "utf8" });
  return { code: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

async function runInit(repoRoot, extra = []) {
  return cli(repoRoot, ["init", "--json", ...extra]);
}

test("init: creates all managed files on a fresh project", async (t) => {
  const { parent, repoRoot } = await makeProject({ packageManager: "pnpm" });
  t.after(async () => cleanProject(parent));
  const r = await runInit(repoRoot);
  assert.equal(r.code, 0, JSON.stringify(r, null, 2));
  for (const p of [
    ".opencode/plugin/opencode-ship.js",
    ".opencode/agents/delivery-reviewer.md",
    ".opencode/agents/delivery-verifier.md",
    ".opencode/skills/delivery-workflow/SKILL.md",
    ".opencode/skills/planning-research-checkpoint/SKILL.md",
    ".opencode/ship.config.json",
    ".opencode/ship.lock.json",
  ]) {
    assert.ok(existsSync(join(repoRoot, p)), `expected ${p} to exist`);
  }
});

test("init: second invocation is a no-op", async (t) => {
  const { parent, repoRoot } = await makeProject({ packageManager: "pnpm" });
  t.after(async () => cleanProject(parent));
  await runInit(repoRoot);
  const second = await runInit(repoRoot);
  assert.equal(second.code, 0);
  const summary = JSON.parse(second.stdout).summary;
  assert.equal(summary.update, 0);
  assert.equal(summary.create, 0);
});

test("diff: detects no changes after a fresh init", async (t) => {
  const { parent, repoRoot } = await makeProject({ packageManager: "yarn" });
  t.after(async () => cleanProject(parent));
  await runInit(repoRoot);
  const r = cli(repoRoot, ["diff", "--json"]);
  assert.equal(r.code, 0);
});

test("init: requires a Git repository", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "opencode-ship-norepo-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const r = cli(dir, ["init", "--json"]);
  assert.equal(r.code, 2);
});

test("init: writes a lock whose content matches the plugin bytes", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));
  await runInit(repoRoot);
  const lock = JSON.parse(readFileSync(join(repoRoot, ".opencode/ship.lock.json"), "utf8"));
  const plugin = lock.files.find((f) => f.path === ".opencode/plugin/opencode-ship.js");
  const shipped = readFileSync(join(PKG_ROOT, "dist/plugin.js"), "utf8");
  assert.equal(plugin.sha256, hashOf(shipped));
});

test("init: refuses to overwrite a modified managed file", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));
  await runInit(repoRoot);
  await writeFileTo(repoRoot, ".opencode/agents/delivery-reviewer.md", "# local edit\n");
  const r = cli(repoRoot, ["update", "--json"]);
  assert.equal(r.code, 3, JSON.stringify(r, null, 2));
});

test("init: --replace-managed overwrites a modified managed file", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));
  await runInit(repoRoot);
  await writeFileTo(repoRoot, ".opencode/agents/delivery-reviewer.md", "# local edit\n");
  const r = cli(repoRoot, ["update", "--replace-managed", "--json"]);
  assert.equal(r.code, 0, JSON.stringify(r, null, 2));
});

test("uninstall: removes managed files that still match the lock", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));
  await runInit(repoRoot);
  const r = cli(repoRoot, ["uninstall", "--json"]);
  assert.equal(r.code, 0, r.stderr);
  for (const p of [
    ".opencode/plugin/opencode-ship.js",
    ".opencode/agents/delivery-reviewer.md",
  ]) {
    assert.ok(!existsSync(join(repoRoot, p)), `${p} should be removed`);
  }
  assert.ok(existsSync(join(repoRoot, ".opencode/ship.config.json")), "user config preserved by default");
});

test("uninstall: preserves a modified managed file", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));
  await runInit(repoRoot);
  await writeFileTo(repoRoot, ".opencode/agents/delivery-reviewer.md", "# local edit\n");
  const r = cli(repoRoot, ["uninstall", "--json"]);
  assert.equal(r.code, 3, JSON.stringify(r, null, 2));
});

function hashOf(s) {
  return createHash("sha256").update(s).digest("hex");
}
