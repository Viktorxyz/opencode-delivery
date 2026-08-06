#!/usr/bin/env node
/*
 * Vendor snapshot verifier.
 *
 * Pure read-only check that the on-disk vendor artefacts match the
 * immutable provenance manifest committed in the repository. Designed
 * to run on a fresh CI checkout (no gitignored clones, no upstream
 * archives, no network access).
 *
 * For every entry in `vendor/sources.json` we assert:
 *
 *   1. The local target file exists at the documented path.
 *   2. The local sha256 of the target matches the manifest.
 *   3. The frozen upstream snapshot exists at the documented path.
 *   4. The frozen snapshot sha256 matches the manifest.
 *   5. The frozen snapshot's bytes hash to the upstream source SHA so
 *      a tampered upstream snapshot cannot pass.
 *   6. The sourceRef is a 40-character hex string (commit SHA).
 *   7. The localSha256 is present and matches the bytes on disk.
 *
 * In addition the script asserts that every entry in the manifest
 * maps to a unique (skill, file) tuple so two aliases cannot collide
 * on the same discovery name.
 *
 * The script exits with a non-zero status on any failure after
 * emitting a short, specific error message.
 */

import { readFile, stat } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";

const REPO = resolve(import.meta.dirname, "..");
const MANIFEST = resolve(REPO, "vendor/sources.json");

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const raw = await readFile(MANIFEST, "utf8");
  const manifest = JSON.parse(raw);
  if (manifest.version !== 1) {
    console.error(`vendor-verify: unsupported manifest version ${manifest.version}`);
    process.exit(2);
  }
  const seen = new Set();
  for (const entry of manifest.sources) {
    const key = `${entry.skill}/${entry.file}`;
    if (seen.has(key)) {
      console.error(`vendor-verify: duplicate (skill, file) entry: ${key}`);
      process.exit(2);
    }
    seen.add(key);
    if (!entry.sourceRef || !/^[0-9a-f]{40}$/.test(entry.sourceRef)) {
      console.error(`vendor-verify: entry ${key} has invalid sourceRef (must be 40-hex): ${entry.sourceRef}`);
      process.exit(2);
    }
    if (!entry.localSha256 || !/^[0-9a-f]{64}$/.test(entry.localSha256)) {
      console.error(`vendor-verify: entry ${key} missing localSha256`);
      process.exit(2);
    }
    if (!entry.sourceSha256 || !/^[0-9a-f]{64}$/.test(entry.sourceSha256)) {
      console.error(`vendor-verify: entry ${key} missing sourceSha256`);
      process.exit(2);
    }
    const localTarget = resolve(REPO, entry.localTarget);
    await stat(localTarget).catch(() => {
      console.error(`vendor-verify: missing local target ${entry.localTarget}`);
      process.exit(2);
    });
    const localBytes = await readFile(localTarget);
    const localHash = sha256Hex(localBytes);
    if (localHash !== entry.localSha256) {
      console.error(`vendor-verify: sha256 mismatch for ${entry.localTarget}`);
      process.exit(2);
    }
    const frozenPath = resolve(REPO, entry.localFrozenPath);
    await stat(frozenPath).catch(() => {
      console.error(`vendor-verify: missing frozen snapshot ${entry.localFrozenPath}`);
      process.exit(2);
    });
    const frozenBytes = await readFile(frozenPath);
    const frozenHash = sha256Hex(frozenBytes);
    if (frozenHash !== entry.localFrozenSha256) {
      console.error(`vendor-verify: frozen snapshot sha256 mismatch for ${entry.localFrozenPath}`);
      process.exit(2);
    }
    if (frozenHash !== entry.sourceSha256) {
      console.error(`vendor-verify: frozen snapshot does not match upstream sourceSHA for ${entry.localFrozenPath}`);
      process.exit(2);
    }
  }
  console.error(`vendor-verify: ${manifest.sources.length} entries verified`);
}

main().catch((err) => {
  console.error(`vendor-verify: ${err?.message ?? err}`);
  process.exit(1);
});
