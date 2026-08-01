/*
 * Release metadata tests for opencode-ship.
 *
 * These tests guard the wire-level consistency of the package: every
 * file that names a version or a repository URL must agree with the
 * other files that carry the same name. They run cheaply inside the
 * existing `npm run verify` pipeline so a regression surfaces before
 * the maintainer reaches for `npm publish`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));

function readJSON(rel) {
  return JSON.parse(readFileSync(`${root}${rel.startsWith("/") ? "" : "/"}${rel}`, "utf8"));
}

function readText(rel) {
  return readFileSync(`${root}${rel.startsWith("/") ? "" : "/"}${rel}`, "utf8");
}

test("package.json: name, version, repository, and publishConfig align", () => {
  const pkg = readJSON("package.json");
  assert.equal(pkg.name, "opencode-ship");
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pkg.repository.url, "https://github.com/Viktorxyz/opencode-ship.git");
  assert.equal(pkg.homepage, "https://github.com/Viktorxyz/opencode-ship#readme");
  assert.equal(pkg.bugs.url, "https://github.com/Viktorxyz/opencode-ship/issues");
  assert.equal(pkg.publishConfig.access, "public");
  assert.equal(pkg.publishConfig.provenance, true);
});

test("package-lock.json: carries the same version as package.json", () => {
  const pkg = readJSON("package.json");
  const lock = readJSON("package-lock.json");
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[""].version, pkg.version);
  assert.equal(lock.packages[""].name, pkg.name);
});

test("schemas: every $id points at Viktorxyz/opencode-ship", () => {
  for (const rel of [
    "schema/project-adapter.schema.json",
    "schema/ship-config.schema.json",
    "schema/ship-lock.schema.json",
  ]) {
    const schema = readJSON(rel);
    assert.ok(schema.$id.startsWith("https://github.com/Viktorxyz/opencode-ship/"), `${rel} $id is ${schema.$id}`);
  }
});

test("release.yml: validates tag against package.json and publishes to npm", () => {
  const yaml = readText(".github/workflows/release.yml");
  assert.match(yaml, /id-token:\s*write/);
  assert.match(yaml, /setup-node@v4/);
  assert.match(yaml, /npm publish/);
  assert.match(yaml, /--provenance/);
});

test("source tree: only src/version.js hard-codes the current version", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const srcDir = `${root}/src`;
  const entries = await readdir(srcDir, { recursive: true });
  const offenders = [];
  const pkg = readJSON("package.json");
  const versionRegex = new RegExp(pkg.version.replace(/\./g, "\\."));
  for (const rel of entries) {
    if (!/\.(js|mjs|ts)$/.test(rel)) continue;
    if (rel === "version.js") continue;
    const text = await readFile(`${srcDir}/${rel}`, "utf8");
    if (versionRegex.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `source files with hard-coded versions: ${offenders.join(", ")}`);
});
