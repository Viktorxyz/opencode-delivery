#!/usr/bin/env node
/*
 * SemVer prerelease detector.
 *
 * Returns `true` when the version carries a SemVer prerelease
 * identifier (`-rc.N`, `-alpha.N`, `-beta.N`, `-pre.N`, or any
 * `-<dot-separated-identifier>` suffix). Returns `false` for the
 * stable form (no `-` suffix after the patch number).
 *
 * The detection is anchored on a single regex so a future release
 * type (e.g. `-dev.N`) is admitted as soon as the workflow admits
 * it: every prerelease label ends with a `-<dot-separated>` suffix
 * immediately after the patch number.
 *
 * The script is intentionally a pure function so the static policy
 * test can import the same implementation the workflow uses. The
 * CLI wrapper exits 0 with the boolean on stdout for shell
 * consumption.
 */

// SemVer core form: <digits>.<digits>.<digits>, optionally
// followed by a prerelease (-<dot-separated identifier>) and/or
// build metadata (+<dot-separated identifier>). A prerelease is
// any version whose core form is followed by `-`. Build metadata
// alone does not promote the version to prerelease.
const CORE_RE = /^\d+\.\d+\.\d+(?:-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(?:\+[0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*)?$/;
const PRERELEASE_RE = /^\d+\.\d+\.\d+-(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*$/;

export function isPrereleaseVersion(version) {
  if (typeof version !== "string" || version.length === 0) return false;
  // A version is a prerelease iff it is a valid SemVer with a
  // `-<label>` segment after the core form. Build metadata
  // suffixes do not promote the version to prerelease.
  return PRERELEASE_RE.test(version);
}

export function isSemVer(version) {
  if (typeof version !== "string") return false;
  return CORE_RE.test(version);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const version = process.argv[2];
  if (!version) {
    console.error("is-prerelease: version argument required");
    process.exit(2);
  }
  process.stdout.write(String(isPrereleaseVersion(version)) + "\n");
  process.exit(0);
}
