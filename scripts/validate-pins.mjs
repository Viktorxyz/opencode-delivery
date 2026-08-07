#!/usr/bin/env node
/*
 * Validate the immutable pin list.
 *
 * The release-policy job asserts that every vendored upstream
 * package still pins to the approved commit SHA. The pin list
 * is generated from vendor/sources.json; if it disagrees with
 * the canonical pins declared here, the release is rejected.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const CANONICAL_PINS = Object.freeze({
  "mattpocock/skills": "2ab958093e83e0ec752e6c1c5932da465bf23e0c",
  "obra/superpowers": "44c9b2d6e889982ac18c27d05a19fefe335194e1",
});

const REPO = resolve(import.meta.dirname, "..");

async function main() {
  const manifest = JSON.parse(await readFile(resolve(REPO, "vendor/sources.json"), "utf8"));
  const seen = new Set();
  for (const e of manifest.sources) {
    if (seen.has(e.repository)) continue;
    seen.add(e.repository);
    const expected = CANONICAL_PINS[e.repository];
    if (!expected) {
      console.error(`release-policy: unknown repository ${e.repository} in vendor/sources.json`);
      process.exit(2);
    }
    if (e.sourceRef !== expected) {
      console.error(`release-policy: ${e.repository} pin must be ${expected}, got ${e.sourceRef}`);
      process.exit(2);
    }
  }
  for (const repo of Object.keys(CANONICAL_PINS)) {
    if (!seen.has(repo)) {
      console.error(`release-policy: ${repo} is missing from vendor/sources.json`);
      process.exit(2);
    }
  }
  console.error("release-policy: pins verified");
}

main().catch((err) => {
  console.error(`release-policy: ${err?.message ?? err}`);
  process.exit(1);
});
