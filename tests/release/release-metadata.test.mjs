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
  assert.match(yaml, /npm install --global npm@11\.5\.2/);
  assert.match(yaml, /npm publish/);
  assert.match(yaml, /--provenance/);
  assert.match(yaml, /opencode-ship-\$\{\{ github\.ref_name \}\}\.tgz/);
});

test("docs: shipping docs reference the approved engineering-workflow plan", () => {
  const changelog = readText("CHANGELOG.md");
  const readme = readText("README.md");
  const planSha = "f85bae931d9eed7763e2f6f4dc68e5fad71bdd38c8a667fc9ffe78b5290200be";
  for (const [name, text] of [["CHANGELOG.md", changelog], ["README.md", readme]]) {
    assert.ok(text.includes(planSha), `${name} must reference the approved plan hash`);
    assert.ok(text.includes("core"), `${name} must keep the documented core profile`);
    assert.ok(!text.includes("practices"), `${name} must not reference the obsolete practices profile`);
  }
});

test("docs: README and CHANGELOG report 317 tests for the v0.8 verification baseline", () => {
  const changelog = readText("CHANGELOG.md");
  const readme = readText("README.md");
  for (const [name, text] of [["CHANGELOG.md", changelog], ["README.md", readme]]) {
    assert.ok(text.includes("317"), `${name} must report the 317-test verification baseline`);
    assert.ok(!/184 tests/.test(text), `${name} must not report the obsolete 184-test baseline`);
    // CHANGELOG.md legitimately records the historic 190 / 226 /
    // 242 / 283 / 302 baselines under their respective sections; we
    // only require that README.md does not reference those
    // obsolete numbers.
    if (name === "README.md") {
      assert.ok(!/190 tests/.test(text), `${name} must not report the obsolete 190-test baseline`);
      assert.ok(!/226 tests/.test(text), `${name} must not report the obsolete 226-test baseline`);
      assert.ok(!/242 tests/.test(text), `${name} must not report the obsolete 242-test baseline`);
      assert.ok(!/283 tests/.test(text), `${name} must not report the obsolete 283-test baseline`);
      assert.ok(!/302 tests/.test(text), `${name} must not report the obsolete 302-test baseline`);
    }
  }
});

test("docs: THIRD_PARTY_NOTICES.md matches the current package version and the engineering profile", () => {
  const notices = readText("THIRD_PARTY_NOTICES.md");
  const pkg = readJSON("package.json");
  const versionPattern = pkg.version.replace(/\./g, "\\.");
  assert.match(
    notices,
    new RegExp(`opencode-ship@${versionPattern}`),
    "notices must reference the current package version",
  );
  // The notices must reference the engineering profile and at
  // least one license surface (e.g. mattpocock/skills or the
  // vendor/mattpocock/LICENSE file).
  assert.match(notices, /engineering.*profile/);
  assert.match(notices, /mattpocock/i);
});

test("source tree: no source file hard-codes the current version", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const srcDir = `${root}/src`;
  const entries = await readdir(srcDir, { recursive: true });
  const offenders = [];
  const pkg = readJSON("package.json");
  const versionRegex = new RegExp(pkg.version.replace(/\./g, "\\."));
  for (const rel of entries) {
    if (!/\.(js|mjs|ts)$/.test(rel)) continue;
    const text = await readFile(`${srcDir}/${rel}`, "utf8");
    if (versionRegex.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], `source files with hard-coded versions: ${offenders.join(", ")}`);
});
