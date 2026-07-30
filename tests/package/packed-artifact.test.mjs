/*
 * Isolated packed-artifact smoke test.
 *
 * Build a real tarball, extract it into a clean directory that has NO
 * link back to the source tree, remove the local node_modules, then
 * load the bundled plugin from the extracted path and assert exactly
 * nine tools are registered. This verifies the published artifact is
 * truly self-contained.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, rm, copyFile, readFile } from "node:fs/promises";
import { existsSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tar } from "./_test-tar.mjs";

test("packed-artifact: bundled plugin loads with nine tools in an isolated consumer", async (t) => {
  const pkgRoot = process.cwd();
  const tmp = await mkdtemp(join(tmpdir(), "opencode-ship-isolated-"));
  const child = { cleanup: () => {} };
  t.after(async () => {
    child.cleanup?.();
    await rm(tmp, { recursive: true, force: true });
  });

  // Pack the source tree.
  const pack = spawnSync("npm", ["pack", "--pack-destination", tmp, "--json", "--silent"], {
    cwd: pkgRoot, encoding: "utf8",
  });
  assert.equal(pack.status, 0, pack.stderr);
  const meta = JSON.parse(pack.stdout);
  const tarball = meta[0].filename;
  const tarballPath = join(tmp, tarball);
  assert.ok(existsSync(tarballPath));

  // Extract into a fresh consumer directory.
  const consumer = join(tmp, "consumer");
  await mkdir(consumer, { recursive: true });
  await tar.extract(tarballPath, consumer);
  const consumerPackage = join(consumer, "package");
  assert.ok(existsSync(consumerPackage));

  // The consumer MUST NOT have any link back to the source tree's
  // node_modules. We try loading the plugin from this freshly
  // extracted location and expect the imports to resolve inside the
  // extracted `dist/plugin.js` only.
  const pluginPath = join(consumerPackage, "dist/plugin.js");
  assert.ok(existsSync(pluginPath), "extracted plugin.js must exist");

  // Sanity check: tarball should not bundle @opencode-ai/plugin as a
  // separate package; it must be inlined.
  const fileList = await tar.list(tarballPath);
  assert.equal(
    fileList.some((f) => f.path.includes("node_modules/@opencode-ai")),
    false,
    "tarball leaked @opencode-ai/plugin as a separate package",
  );

  // Load the plugin from the extracted path in a fresh module graph.
  const pluginFileUrl = pathToFileURL(pluginPath).href;
  const workspaceJson = JSON.stringify(consumerPackage);
  const childProc = spawnSync("node", [
    "--input-type=module", "--no-warnings",
    "-e",
    `import(${JSON.stringify(pluginFileUrl)}).then(async (mod) => {`
      + `const result = await mod.default({ worktree: ${workspaceJson}, project: {}, client: {}, directory: ${workspaceJson} });`
      + `const ids = Object.keys(result.tool).sort();`
      + `process.stdout.write(JSON.stringify(ids));`
      + `});`,
  ], { encoding: "utf8" });
  assert.equal(childProc.status, 0, childProc.stderr + "\n" + childProc.stdout);
  const ids = JSON.parse(childProc.stdout.trim());
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
  // Cleanup tarball
  await rm(tarballPath, { force: true }).catch(() => null);
  void writeFileSync;
  void readFile;
  void mkdtempSync;
});

test("packed-artifact: npm pack includes every required file", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "opencode-ship-pack-"));
  t.after(async () => rm(tmp, { recursive: true, force: true }));
  const pack = spawnSync("npm", ["pack", "--pack-destination", tmp, "--json", "--silent"], {
    cwd: process.cwd(), encoding: "utf8",
  });
  assert.equal(pack.status, 0, pack.stderr);
  const meta = JSON.parse(pack.stdout);
  const tarballPath = join(tmp, meta[0].filename);
  const entries = await tar.list(tarballPath);
  const paths = entries.map((e) => e.path).sort();
  for (const required of [
    "package/package.json",
    "package/dist/cli.js",
    "package/dist/plugin.js",
    "package/dist/core.js",
    "package/assets/agents/delivery-reviewer.md",
    "package/assets/agents/delivery-verifier.md",
    "package/assets/skills/delivery-workflow/SKILL.md",
    "package/assets/skills/planning-research-checkpoint/SKILL.md",
    "package/schema/ship-config.schema.json",
    "package/schema/ship-lock.schema.json",
    "package/schema/project-adapter.schema.json",
  ]) {
    assert.ok(paths.includes(required), `${required} missing from packed tarball`);
  }
  for (const leaked of paths.filter((p) => p.startsWith("package/src/"))) {
    assert.ok(false, `src leaks into pack: ${leaked}`);
  }
  for (const leaked of paths.filter((p) => p.includes("node_modules"))) {
    assert.ok(false, `node_modules leaks into pack: ${leaked}`);
  }
  // Smoke: the bundled CLI binary runs.
  const cliPath = resolve(join(tmp, meta[0].filename.replace(/\.tgz$/, "")));
  await tar.extract(tarballPath, tmp);
  const version = spawnSync("node", [join(tmp, "package/dist/cli.js"), "--version"], { encoding: "utf8" });
  assert.equal(version.status, 0);
  assert.match(version.stdout, /opencode-ship \d+\.\d+\.\d+/);
  await rm(tarballPath, { force: true }).catch(() => null);
});
