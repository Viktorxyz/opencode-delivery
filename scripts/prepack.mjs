#!/usr/bin/env node
/* npm `prepack` hook: build first, validate catalog, fail closed if any
 * required artifact is missing. */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

function fail(msg) {
  process.stderr.write(`prepack: ${msg}\n`);
  process.exit(1);
}

const esbuildBin = resolve(root, "node_modules/.bin/esbuild");
if (!existsSync(esbuildBin)) {
  fail("esbuild missing; run `npm install` first");
}

const tscBin = resolve(root, "node_modules/.bin/tsc");
if (!existsSync(tscBin)) {
  fail("typescript missing; run `npm install` first");
}

const build = spawnSync("node", [resolve(root, "scripts/build.mjs")], { stdio: "inherit" });
if (build.status !== 0) {
  fail(`build failed with exit ${build.status ?? "?"}`);
}

const catalogCheck = spawnSync("node", [
  "--input-type=module",
  "--no-warnings",
  "-e",
  `import { validateCatalog } from ${JSON.stringify(resolve(root, "src/installer/catalog.js"))};`
  + "(async () => { try { validateCatalog(); } catch (e) { process.stderr.write('validateCatalog: ' + (e?.message ?? e) + '\\n'); process.exit(2); } })();",
], { stdio: "inherit" });
if (catalogCheck.status !== 0) {
  fail(`catalog validation failed with exit ${catalogCheck.status ?? "?"}`);
}

const pkgRaw = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
if (pkgRaw.version !== peekVersionFromSource()) {
  fail("src/version.js fallback does not match package.json");
}

for (const path of [
  "dist/plugin.js",
  "dist/cli.js",
  "dist/core.js",
  "dist/plugin.d.ts",
  "dist/cli.d.ts",
  "dist/core.d.ts",
  "assets/agents/delivery-reviewer.md",
  "assets/agents/delivery-verifier.md",
  "assets/skills/delivery-workflow/SKILL.md",
  "assets/skills/planning-research-checkpoint/SKILL.md",
  "schema/project-adapter.schema.json",
  "schema/ship-config.schema.json",
  "schema/ship-lock.schema.json",
  "THIRD_PARTY_NOTICES.md",
  "LICENSE",
  "README.md",
  "CHANGELOG.md",
]) {
  if (!existsSync(resolve(root, path))) {
    fail(`expected packaged artifact missing: ${path}`);
  }
}

function peekVersionFromSource() {
  const raw = readFileSync(resolve(root, "src/version.js"), "utf8");
  const match = raw.match(/FALLBACK_VERSION\s*=\s*"([^"]+)"/);
  return match ? match[1] : null;
}
