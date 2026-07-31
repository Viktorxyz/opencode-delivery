#!/usr/bin/env node
/* npm `prepack` hook: build first, fail closed if outputs are missing. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
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

for (const path of [
  "dist/plugin.js",
  "dist/cli.js",
  "dist/core.js",
  "dist/plugin.d.ts",
  "dist/cli.d.ts",
  "dist/core.d.ts",
]) {
  if (!existsSync(resolve(root, path))) {
    fail(`expected build artifact missing: ${path}`);
  }
}