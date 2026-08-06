#!/usr/bin/env node
/*
 * Guarded package.json reader.
 *
 * The workflow invokes this script from inside the checked-out
 * release ref. If package.json is missing (because the ref did
 * not check out a tree, or because npm ci left the workspace in
 * an unexpected state), the script prints an actionable error
 * instead of the cryptic `Cannot find module './package.json'`
 * that `node -p "require('./package.json').version"` produces.
 *
 * Usage:
 *   node scripts/get-version.mjs                  # prints the version
 *   node scripts/get-version.mjs --package        # prints the whole package.json
 *   node scripts/get-version.mjs --check         # exits 0 if found, 2 otherwise
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const packagePath = resolve(root, "package.json");

function fail(msg) {
  process.stderr.write(`get-version: ${msg}\n`);
  process.exit(2);
}

if (process.argv.includes("--check")) {
  if (!existsSync(packagePath)) fail(`package.json not found at ${root}`);
  process.exit(0);
}

if (!existsSync(packagePath)) {
  fail(`package.json not found at ${root}`);
}

const text = readFileSync(packagePath, "utf8");
let parsed;
try {
  parsed = JSON.parse(text);
} catch (err) {
  fail(`package.json is not valid JSON: ${err.message ?? err}`);
}

if (process.argv.includes("--package")) {
  process.stdout.write(JSON.stringify(parsed, null, 2) + "\n");
  process.exit(0);
}

if (typeof parsed.version !== "string" || parsed.version.length === 0) {
  fail("package.json has no version field");
}

process.stdout.write(parsed.version + "\n");
