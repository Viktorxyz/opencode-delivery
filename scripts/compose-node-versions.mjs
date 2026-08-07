#!/usr/bin/env node
/*
 * Aggregate the per-row Node-version files uploaded by the
 * node-compat job. Each row writes three files named after the
 * declared matrix.node value:
 *
 *   <matrix>.declared   - the matrix.node value
 *   <matrix>.observed   - the literal `node --version` output
 *   <matrix>.observed.sha256
 *                        - "sha256:<hex>" of the observed file
 *
 * The script is intentionally pure: it reads the directory, sorts
 * by declared version, and emits a stable JSON object. CI and
 * tests consume the same script so the report shape cannot drift.
 *
 * Usage: `node scripts/compose-node-versions.mjs <dir>`
 * Prints a single JSON object and exits non-zero on parse errors.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? "dist-pkg/node-versions");
if (!dir) {
  console.error("compose-node-versions: directory argument is required");
  process.exit(2);
}

async function main() {
  let entries;
  try {
    entries = await readdir(dir);
  } catch (e) {
    // Missing directory means the job has not produced output
    // yet (or the artifact was not uploaded). Emit an empty
    // matrix so the qualification report still parses.
    process.stdout.write("[]\n");
    return;
  }
  const declared = entries.filter((e) => e.endsWith(".declared"));
  const rows = [];
  for (const declFile of declared) {
    const base = declFile.slice(0, -".declared".length);
    const observedFile = join(dir, `${base}.observed`);
    const shaFile = join(dir, `${base}.observed.sha256`);
    const declaredValue = (await readFile(join(dir, declFile), "utf8")).trim();
    const observed = (await readFile(observedFile, "utf8")).trim();
    let observedSha = "";
    try {
      observedSha = (await readFile(shaFile, "utf8")).trim();
    } catch {
      // The sha sidecar is optional; recompute when missing.
      const { createHash } = await import("node:crypto");
      const buf = await readFile(observedFile);
      observedSha = `sha256:${createHash("sha256").update(buf).digest("hex")}`;
    }
    rows.push({ matrixNode: declaredValue, observed, observedSha });
  }
  rows.sort((a, b) => a.matrixNode.localeCompare(b.matrixNode, "en", { numeric: true }));
  process.stdout.write(JSON.stringify(rows) + "\n");
}

main().catch((e) => {
  console.error(`compose-node-versions: ${e?.message ?? e}`);
  process.exit(1);
});
