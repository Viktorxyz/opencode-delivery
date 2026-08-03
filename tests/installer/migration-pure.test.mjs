/*
 * Pure-migration tests for opencode-ship.
 *
 * After v0.3.0 the `migration()` detector must be a pure function: it
 * reads legacy shapes, proposes a config seed, and never writes
 * anything to disk. `init`, `update`, and `diff` then translate that
 * seed into a real config-write only when they actually commit.
 *
 * These tests assert the new invariant via the public CLI:
 *   1. `diff` with a legacy adapter present does not create
 *      `ship.config.json` on disk.
 *   2. `init` with a legacy adapter present does create it.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";

import { makeProject, cleanProject } from "../fixtures/installer-fixture.mjs";
import { migration } from "../../src/installer/migration.js";

const CLI = resolve("dist/cli.js");

function cli(repoRoot, args) {
  return spawnSync("node", [CLI, ...args, "--root", repoRoot, "--json"], { encoding: "utf8" });
}

async function seedLegacyAdapter(repoRoot) {
  await mkdir(join(repoRoot, ".opencode"), { recursive: true });
  await writeFile(join(repoRoot, ".opencode/delivery.json"), JSON.stringify({
    contractVersion: 1,
    repository: { remote: "origin", defaultBranch: { discover: true } },
    worktree: { root: ".worktrees", branchTemplate: "{actor}/{slug}", bootstrap: [["npm", "install"]] },
    verification: { commands: [{ id: "ci", argv: ["npm", "run", "verify"], timeoutMs: 600000 }], requireCleanDiffAfter: true, invalidateOnHeadChange: true },
    review: { agent: "delivery-reviewer", required: true, invalidateOnHeadChange: true },
    ci: { driver: "github-status-checks", requiredChecks: ["delivery-verify"], wait: true, flakyRetry: 1 },
    ready: { requires: ["review", "local-verification", "remote-ci"], stopAfterReady: true },
    merge: { strategy: "squash", policy: "explicit-user-request-only", requireFreshGates: true },
    cleanup: { when: "next-task", requires: ["pr-merged", "worktree-clean", "no-unpublished-commits"] },
  }, null, 2));
}

test("migration: returns proposedConfigSeed without writing to disk", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));
  await seedLegacyAdapter(repoRoot);

  const report = await migration({ repoRoot, lock: null, forceRepair: false });
  assert.ok(report.proposedConfigSeed, "migration must produce a proposedConfigSeed for a legacy adapter");
  assert.equal(existsSync(join(repoRoot, ".opencode/ship.config.json")), false,
    "migration alone must never write ship.config.json");
});

test("diff: legacy adapter present does not materialise ship.config.json", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));
  await seedLegacyAdapter(repoRoot);
  const r = cli(repoRoot, ["diff"]);
  // diff never writes; its exit code may be 0 or 1 depending on the plan,
  // but the config file must not appear on disk.
  assert.ok(r.status === 0 || r.status === 1, `unexpected diff exit ${r.status}: ${r.stderr}`);
  assert.equal(existsSync(join(repoRoot, ".opencode/ship.config.json")), false,
    "diff must never write ship.config.json");
});

test("init: legacy adapter present materialises ship.config.json from the legacy seed", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));
  await seedLegacyAdapter(repoRoot);
  const r = cli(repoRoot, ["init"]);
  assert.equal(r.status, 0, r.stderr);
  const configPath = join(repoRoot, ".opencode/ship.config.json");
  assert.ok(existsSync(configPath));
  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(config.project.repository, "Viktorxyz/fixture");
});
