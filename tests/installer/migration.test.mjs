/*
 * Legacy consumer migration test.
 *
 * Simulates a consumer that already has v0.1.x shapes on disk:
 *   - .opencode/delivery.json
 *   - .opencode/delivery.lock.json
 *   - a generic plugin file at .opencode/plugin/delivery.ts
 *   - canonical agents at .opencode/agents/delivery-{reviewer,verifier}.md
 *
 * The CLI must recognise all of these, NOT delete them, and
 * install the opencode-ship-managed files alongside without
 * upgrading until the user runs `update` or `init`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, writeFile, readFile, rename } from "node:fs/promises";
import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { makeProject, cleanProject } from "../fixtures/installer-fixture.mjs";
import { writeLock } from "../../src/installer/lock.js";

const CLI = resolve("dist/cli.js");

function cli(repoRoot, args) {
  return spawnSync("node", [CLI, ...args, "--root", repoRoot, "--json"], { encoding: "utf8" });
}

test("migration: detects the legacy adapter and lock", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));
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
    forge: { driver: "github", issueRequired: true, draftAfterFirstCommit: true, issueClosingSyntax: true },
  }, null, 2));
  await writeFile(join(repoRoot, ".opencode/delivery.lock.json"), JSON.stringify({
    contractVersion: 1,
    adapterSha256: "abc123",
    writtenAt: new Date().toISOString(),
  }, null, 2));
  await mkdir(join(repoRoot, ".opencode/plugin"), { recursive: true });
  await writeFile(join(repoRoot, ".opencode/plugin/delivery.ts"), "/* legacy generic wrapper */\nexport default function () {}\n");
  const r = cli(repoRoot, ["init", "--json"]);
  assert.equal(r.status, 0, r.stderr);
  // Legacy artifacts must be preserved.
  assert.ok(existsSync(join(repoRoot, ".opencode/delivery.json")));
  assert.ok(existsSync(join(repoRoot, ".opencode/plugin/delivery.ts")));
  // New artifacts must be installed.
  assert.ok(existsSync(join(repoRoot, ".opencode/plugins/opencode-ship.js")));
  assert.ok(existsSync(join(repoRoot, ".opencode/ship.config.json")));
  assert.ok(existsSync(join(repoRoot, ".opencode/ship.lock.json")));
  void readFile;
});

test("migration: update removes the lock-owned singular plugin path", async (t) => {
  const { parent, repoRoot } = await makeProject();
  t.after(async () => cleanProject(parent));

  const initial = cli(repoRoot, ["init"]);
  assert.equal(initial.status, 0, initial.stderr);

  const pluralPath = join(repoRoot, ".opencode/plugins/opencode-ship.js");
  const singularPath = join(repoRoot, ".opencode/plugin/opencode-ship.js");
  await mkdir(join(repoRoot, ".opencode/plugin"), { recursive: true });
  await rename(pluralPath, singularPath);

  const lockPath = join(repoRoot, ".opencode/ship.lock.json");
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  const plugin = lock.files.find((entry) => entry.kind === "plugin");
  plugin.path = ".opencode/plugin/opencode-ship.js";
  await writeLock(repoRoot, lock);

  const updated = cli(repoRoot, ["update"]);
  assert.equal(updated.status, 0, updated.stderr);
  assert.equal(existsSync(singularPath), false);
  assert.equal(existsSync(pluralPath), true);

  const updatedLock = JSON.parse(await readFile(lockPath, "utf8"));
  assert.equal(updatedLock.files.some((entry) => entry.path === ".opencode/plugin/opencode-ship.js"), false);
});
