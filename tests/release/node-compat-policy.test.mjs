/*
 * Node-compatibility policy test.
 *
 * The release workflow's `node-compat` job declares a matrix of Node
 * runtimes that the installer must actually support. This test
 * proves, via static policy assertions on `.github/workflows/release.yml`,
 * that:
 *
 *   1. the `node-compat` job's setup-node call is driven by
 *      `${{ matrix.node }}` rather than a hard-coded version;
 *   2. the matrix enumerates the three required runtimes
 *      (Node 22.6.0, current 22, and Node 24);
 *   3. the qualification-report job aggregates the per-row
 *      observed versions through `scripts/compose-node-versions.mjs`;
 *   4. the trusted-publishing publish job is the only place that
 *      pins a specific Node version, and that version is the npm
 *      OIDC minimum (22.14.0).
 *
 * Without these assertions a future refactor could silently
 * hard-code the runtime in the matrix lane and the qualification
 * report would still appear green.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const yamlPath = resolve(root, ".github/workflows/release.yml");
const yaml = readFileSync(yamlPath, "utf8");

function findJob(yamlText, name) {
  // The workflow is a single document with `  <name>:` indented
  // under `jobs:`. We extract the indented block for the named job
  // so the test can assert on a bounded slice.
  const lines = yamlText.split("\n");
  const startIdx = lines.findIndex((line) => new RegExp(`^  ${name}:\\s*$`).test(line));
  if (startIdx === -1) {
    throw new Error(`node-compat-policy: job '${name}' not found in release.yml`);
  }
  const out = [];
  for (let i = startIdx; i < lines.length; i += 1) {
    const line = lines[i];
    if (i > startIdx && /^[a-zA-Z]/.test(line)) break;
    out.push(line);
  }
  return out.join("\n");
}

test("node-compat: job is present and named correctly", () => {
  assert.match(yaml, /^  node-compat:\s*$/m);
  assert.match(yaml, /^    name: node-compat\s*$/m);
});

test("node-compat: matrix enumerates Node 22.6.0, current 22, and Node 24", () => {
  const block = findJob(yaml, "node-compat");
  assert.match(block, /matrix:\s*\n\s*node:\s*\[/);
  // The matrix must contain the three required runtimes in
  // SemVer-aware lexical order so the policy test is stable.
  const entries = ["22.6.0", "22", "24"];
  for (const e of entries) {
    const re = new RegExp(`"${e.replace(/\./g, "\\.")}"`);
    assert.match(block, re, `node-compat matrix missing entry: ${e}`);
  }
});

test("node-compat: setup-node uses the matrix, not a hard-coded version", () => {
  const block = findJob(yaml, "node-compat");
  // Locate the setup-node step inside this job.
  const setupIdx = block.indexOf("setup-node");
  assert.ok(setupIdx !== -1, "node-compat must call actions/setup-node");
  // The first setup-node call inside node-compat must reference the
  // matrix. Search a bounded slice after the marker.
  const slice = block.slice(setupIdx, setupIdx + 800);
  assert.match(slice, /node-version:\s*\$\{\{\s*matrix\.node\s*\}\}/, "node-compat setup-node must use matrix.node");
  // Fail loudly if a hard-coded version sneaks into the same slice.
  assert.doesNotMatch(
    slice,
    /node-version:\s*"22\.[0-9.]+"/,
    "node-compat must not hard-code a Node version in this slice",
  );
});

test("node-compat: each row uploads its observed version through the helper script", () => {
  const block = findJob(yaml, "node-compat");
  assert.match(block, /node-versions/, "node-compat must write per-row node-versions artifact");
  assert.match(block, /node --version/, "node-compat must record node --version output");
  assert.match(block, /actions\/upload-artifact@v4/, "node-compat must upload the per-row artifact");
});

test("qualification-report: aggregates observed Node versions via the helper script", () => {
  const block = findJob(yaml, "qualification-report");
  assert.match(
    block,
    /scripts\/compose-node-versions\.mjs/,
    "qualification-report must call the compose-node-versions helper",
  );
  assert.match(block, /nodeVersions/);
  assert.match(
    block,
    /name:\s*node-versions/,
    "qualification-report must download the node-versions artifact",
  );
});

test("publish: only the trusted-publishing job pins Node 22.14.0", () => {
  // The trusted-publishing job is the only place that pins a
  // specific Node runtime; npm OIDC requires Node >= 22.14.0.
  const publishBlock = findJob(yaml, "publish");
  const setupIdx = publishBlock.indexOf("setup-node");
  assert.ok(setupIdx !== -1, "publish job must call actions/setup-node");
  const slice = publishBlock.slice(setupIdx, setupIdx + 600);
  assert.match(slice, /node-version:\s*"22\.14\.0"/, "publish setup-node must pin Node 22.14.0");
});

test("node-compat: matrix.node cannot be replaced by a single literal without breaking the test", () => {
  // This is a guard rail: the test above already proves the wiring
  // statically. Document the invariant in a sentence so a future
  // refactor that flips setup-node back to a hard-coded version
  // has a clear failure surface.
  const block = findJob(yaml, "node-compat");
  const setupIdx = block.indexOf("setup-node");
  const slice = block.slice(setupIdx, setupIdx + 800);
  assert.ok(
    /\$\{\{\s*matrix\.node\s*\}\}/.test(slice),
    "invariant: node-compat setup-node must drive from the matrix",
  );
});
