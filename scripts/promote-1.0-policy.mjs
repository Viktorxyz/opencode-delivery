#!/usr/bin/env node
/*
 * 1.0 promotion policy.
 *
 * The plan forbids promoting a `1.0.x` tag unless the runtime
 * source bytes are byte-equivalent to the accepted `0.10.0`
 * release. The byte-equivalence witness is the
 * `runtimeSourceSha256` field of the qualification report
 * (computed by `scripts/runtime-source-sha.mjs`).
 *
 * This script fetches the accepted `0.10.0` qualification
 * artifact from the corresponding GitHub release, compares the
 * stored digest to the digest computed from the current source
 * tree, and exits non-zero on any mismatch.
 *
 * Usage:
 *   node scripts/promote-1.0-policy.mjs <repo> <current-digest>
 *
 * The script is intentionally pure: it shells out to `gh` for
 * the download so the release-policy job does not need extra
 * Node-only dependencies. Errors are fatal and print the exact
 * path forward.
 */

import { spawnSync } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeRuntimeSourceSha256 } from "./runtime-source-sha.mjs";

const REPO = process.argv[2] ?? "Viktorxyz/opencode-ship";
const currentDigest = process.argv[3];
const baselineTag = process.argv[4] ?? "0.10.0";

if (!currentDigest) {
  console.error("promote-1.0-policy: <current-digest> argument is required");
  process.exit(2);
}

function fail(msg) {
  console.error(`promote-1.0-policy: ${msg}`);
  process.exit(2);
}

async function fetchBaselineDigest() {
  // Download the qualification artifact via `gh release download`.
  // The command writes the file to disk with the asset name
  // preserved so we can pick the matching one even when a release
  // ships multiple qualification files (e.g. one per matrix lane).
  const tmp = await mkdtemp(join(tmpdir(), "promote-1.0-policy-"));
  try {
    const dl = spawnSync("gh", [
      "release",
      "download",
      baselineTag,
      "--repo", REPO,
      "--pattern", "*.qualification.json",
      "--dir", tmp,
    ], { encoding: "utf8" });
    if (dl.status !== 0) {
      fail(`unable to download ${baselineTag} qualification artifact: ${dl.stderr || dl.stdout}`);
    }
    // Locate the artifact on disk. The pattern matches every
    // file ending in `.qualification.json`; pick the one with
    // the highest lexicographic order so the most recent
    // qualification report wins.
    const { readdir } = await import("node:fs/promises");
    const files = (await readdir(tmp))
      .filter((f) => f.endsWith(".qualification.json"))
      .sort();
    if (files.length === 0) {
      fail(`no .qualification.json artifact on ${baselineTag} release`);
    }
    const path = join(tmp, files[files.length - 1]);
    const text = await readFile(path, "utf8");
    try {
      const obj = JSON.parse(text);
      return obj.runtimeSourceSha256 ?? null;
    } catch (e) {
      fail(`unable to parse ${baselineTag} qualification artifact: ${e.message ?? e}`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => null);
  }
}

async function main() {
  // Re-compute the digest from the local source tree so the
  // caller does not need to recompute the workflow's value. The
  // caller-supplied digest is the workflow's reported value; we
  // compare both against the baseline.
  const local = await computeRuntimeSourceSha256({ repoRoot: process.cwd() });
  if (local.digest !== currentDigest) {
    fail(`local digest ${local.digest} disagrees with reported digest ${currentDigest}`);
  }
  const baseline = await fetchBaselineDigest();
  if (!baseline) {
    fail(`accepted ${baselineTag} qualification artifact is missing runtimeSourceSha256`);
  }
  if (baseline !== local.digest) {
    fail(`runtime-source digest mismatch: accepted ${baselineTag}=${baseline} vs current=${local.digest}`);
  }
  console.log(`promote-1.0-policy: digest ${local.digest} matches accepted ${baselineTag}`);
}

main().catch((e) => fail(e?.message ?? e));
