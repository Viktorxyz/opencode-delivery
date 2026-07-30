/*
 * Packed-artifact smoke test.
 *
 * `npm pack` produces a tarball without publishing it; we then
 * verify the file list and smoke-test the bundled CLI inside an
 * empty consumer project.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";
import { tar } from "./_test-tar.mjs";

test("packed-artifact: npm pack produces a tarball with the right files", async (t) => {
  const tmp = await mkdtemp(join(tmpdir(), "opencode-ship-pack-"));
  t.after(async () => rm(tmp, { recursive: true, force: true }));
  const pack = spawnSync("npm", ["pack", "--json", "--silent"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  assert.equal(pack.status, 0, pack.stderr);
  const meta = JSON.parse(pack.stdout);
  const tarball = meta[0].filename;
  const tarPath = resolve(tarball);
  assert.ok(existsSync(tarPath), `tarball ${tarball} missing`);
  const entries = await tar.list(tarPath);
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
  // Verify that NO src/ files leak into the consumer artifact.
  for (const leaked of paths.filter((p) => p.startsWith("package/src/"))) {
    assert.ok(false, `src leaks into pack: ${leaked}`);
  }
  // Verify that node_modules is never packaged.
  for (const leaked of paths.filter((p) => p.includes("node_modules"))) {
    assert.ok(false, `node_modules leaks into pack: ${leaked}`);
  }
  // Smoke: extract the tarball into a clean dir and execute the bundled binary.
  const consumer = join(tmp, "consumer");
  await mkdir(consumer, { recursive: true });
  await tar.extract(tarPath, consumer);
  const cliPath = join(consumer, "package/dist/cli.js");
  assert.ok(existsSync(cliPath));
  const help = spawnSync("node", [cliPath, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.ok(help.stdout.includes("opencode-ship"));
  const version = spawnSync("node", [cliPath, "--version"], { encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  assert.match(version.stdout, /opencode-ship \d+\.\d+\.\d+/);
  // Discard the local tarball now that we've validated it.
  const { unlink } = await import("node:fs/promises");
  await unlink(tarPath).catch(() => null);
  void readFile;
  void writeFile;
});
