/*
 * Vendor manifest loader & validator.
 *
 * Records every third-party file shipped under `assets/`. prepack
 * uses it to fail closed; the runtime never does. The schema is
 * versioned so the loader can detect older shapes.
 *
 * Each `sources[]` entry is the immutable contract:
 *
 *   - repository   "<owner>/<repo>" the file was vendored from
 *   - sourceRef    immutable commit SHA (or tag) of the upstream
 *   - upstreamPath path inside the upstream repo at sourceRef
 *   - localTarget  path inside this package where it ships
 *   - sourceSha256 SHA-256 of the upstream file (hex, 64 chars)
 *   - reuseMode    unchanged | adapted | ported
 *   - license      SPDX license identifier
 *   - adaptationNote free text describing the change (or lack)
 *
 * prepack also runs an integrity check: every localTarget must
 * exist and its actual SHA-256 must match sourceSha256. The
 * validator returns `{ ok, kind, issues }`; the loader surfaces
 * parse errors as `kind: "parse"` and file-shape problems as
 * `kind: "shape"`. prepack maps these to its own exit codes.
 */

import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { bytesHash } from "./hash.js";

export const CURRENT_MANIFEST_VERSION = 1;

const REUSE_MODES = new Set(["unchanged", "adapted", "ported"]);
const HEX64 = /^[0-9a-f]{64}$/;

function requireString(obj, key, issues) {
  if (typeof obj[key] !== "string" || obj[key].length === 0) {
    issues.push(`missing string field: ${key}`);
    return null;
  }
  return obj[key];
}

/**
 * Fail-closed manifest validator. Returns `{ ok, kind, issues }`
 * so callers can map kinds to exit codes. Never throws.
 */
export function validateManifest(raw) {
  if (raw === null || raw === undefined) {
    return { ok: false, kind: "shape", issues: ["manifest is empty"] };
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, kind: "shape", issues: ["manifest root must be an object"] };
  }
  const issues = [];
  let kind = "ok";
  if (raw.version !== CURRENT_MANIFEST_VERSION) {
    issues.push(`unsupported manifest version: ${JSON.stringify(raw.version)} (expected ${CURRENT_MANIFEST_VERSION})`);
    kind = "shape";
  }
  if (!Array.isArray(raw.sources)) {
    issues.push("sources must be an array");
    kind = "shape";
    return { ok: false, kind, issues };
  }
  const seenTargets = new Set();
  for (const e of raw.sources) {
    if (!e || typeof e !== "object") {
      issues.push("entry is not an object");
      kind = "shape";
      continue;
    }
    const entryIssuesBefore = issues.length;
    const repository = requireString(e, "repository", issues);
    const sourceRef = requireString(e, "sourceRef", issues);
    const upstreamPath = requireString(e, "upstreamPath", issues);
    const localTarget = requireString(e, "localTarget", issues);
    const sourceSha256 = requireString(e, "sourceSha256", issues);
    const reuseMode = requireString(e, "reuseMode", issues);
    const license = requireString(e, "license", issues);
    const adaptationNote = requireString(e, "adaptationNote", issues);
    if (issues.length > entryIssuesBefore) kind = "shape";
    if (!REUSE_MODES.has(reuseMode)) {
      issues.push(`unknown reuseMode: ${JSON.stringify(reuseMode)} (expected one of: ${[...REUSE_MODES].join(", ")})`);
      kind = "shape";
    }
    if (sourceSha256 && !HEX64.test(sourceSha256)) {
      issues.push(`sourceSha256 is not a 64-char hex string: ${sourceSha256}`);
      kind = "shape";
    }
    if (localTarget && seenTargets.has(localTarget)) {
      issues.push(`duplicate localTarget: ${localTarget}`);
      kind = "duplicate-target";
    }
    if (localTarget) seenTargets.add(localTarget);
    // Marker so unused vars are not flagged as such by the linter.
    void repository; void sourceRef; void upstreamPath; void license; void adaptationNote;
  }
  return { ok: issues.length === 0, kind, issues };
}

/**
 * Read the manifest from disk. Returns null when the file does
 * not exist (fresh package, no third-party content). Returns
 * `{ kind, issues, manifest }` on any validation failure so
 * callers can surface the diagnostic.
 */
export async function loadManifest(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  let raw;
  try {
    const text = await readFile(manifestPath, "utf8");
    raw = JSON.parse(text);
  } catch (e) {
    return { kind: "parse", issues: [`unable to parse manifest JSON: ${e?.message ?? e}`], manifest: null };
  }
  const validation = validateManifest(raw);
  if (!validation.ok) {
    return { kind: validation.kind, issues: validation.issues, manifest: raw };
  }
  return { kind: "ok", issues: [], manifest: raw };
}

/**
 * Hash the file on disk and compare it to the manifest's
 * recorded sourceSha256. Returns `{ ok, actual, expected }`.
 */
export async function verifyManifestIntegrity(manifest, repoRoot) {
  if (!manifest || !Array.isArray(manifest.sources)) {
    return { ok: false, mismatches: [], missing: [] };
  }
  const mismatches = [];
  const missing = [];
  for (const e of manifest.sources) {
    const target = resolve(repoRoot, e.localTarget);
    if (!existsSync(target)) {
      missing.push(e.localTarget);
      continue;
    }
    const buf = await readFile(target);
    const actual = bytesHash(buf);
    if (actual !== e.sourceSha256) {
      mismatches.push({ target: e.localTarget, expected: e.sourceSha256, actual });
    }
  }
  return { ok: mismatches.length === 0 && missing.length === 0, mismatches, missing };
}

/**
 * Aggregate counts by reuseMode. Used by prepack's human and
 * JSON reports.
 */
export function manifestSummary(manifest) {
  const out = { total: 0, byMode: { unchanged: 0, adapted: 0, ported: 0 } };
  if (!manifest || !Array.isArray(manifest.sources)) return out;
  out.total = manifest.sources.length;
  for (const e of manifest.sources) {
    if (e && out.byMode[e.reuseMode] !== undefined) out.byMode[e.reuseMode] += 1;
  }
  return out;
}
