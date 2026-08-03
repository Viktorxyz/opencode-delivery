/*
 * Install manifest persistence.
 *
 * Locks live at `.opencode/ship.lock.json`. This module handles
 * read, write, integrity computation, and migration from the v0.1.x
 * legacy lock (`.opencode/delivery.lock.json`) into a v0.2
 * manager-aware lock.
 *
 * `integrity.lockSha256` is computed over the lock contents minus
 * the `integrity` field itself, so consumers and installers can
 * detect tampering.
 *
 * Schema enforcement: `CURRENT_LOCK_SCHEMA` is the only schema the
 * installer speaks. `validateLock` distinguishes between "no lock
 * here" (treated as a fresh install by callers), "supported lock"
 * (clean path), and "unsupported lock" (caller maps to exit 5).
 * Integrity mismatches and parse failures map to exit 3.
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { bytesHashString } from "./hash.js";
import { stableStringify } from "./json-pointer.js";
import { DEFAULT_PROFILE, isValidProfile } from "../profile.js";

export const CURRENT_LOCK_SCHEMA = 2;

/**
 * Lock schema revisions:
 *   1 - legacy manager-aware schema; `manager.schemaVersion` and
 *       `contractVersion` are both 1; integrity section present;
 *       `manager.profile` is absent and resolves to legacy core.
 *   2 - profile-aware schema: `manager.profile` is REQUIRED on
 *       newly written locks and validated to be one of PROFILES.
 *       v1 locks still validate (legacy core) so consumers on
 *       earlier versions can upgrade without manual migration.
 */
export function lockSchemaRevision() {
  return CURRENT_LOCK_SCHEMA;
}

export function lockPath(repoRoot) {
  return resolve(repoRoot, ".opencode", "ship.lock.json");
}

export async function readLock(repoRoot) {
  const path = lockPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw);
    return parsed;
  } catch {
    return null;
  }
}

export async function writeLock(repoRoot, lock) {
  const path = lockPath(repoRoot);
  await mkdir(dirname(path), { recursive: true });
  const integrity = computeIntegrity(lock);
  const finalLock = { ...lock, integrity };
  const raw = JSON.stringify(finalLock, null, 2) + "\n";
  const tmp = `${path}.tmp`;
  await writeFile(tmp, raw, "utf8");
  await rename(tmp, path);
  return path;
}

export function computeIntegrity(lock) {
  const { integrity: _ignored, ...without } = lock ?? {};
  void _ignored;
  return {
    lockSha256: bytesHashString(stableStringify(without)),
  };
}

export async function validateIntegrity(lock) {
  if (!lock?.integrity?.lockSha256) return false;
  const expected = computeIntegrity(lock).lockSha256;
  return expected === lock.integrity.lockSha256;
}

/**
 * Strict lock validator.
 *
 * Returns `{ ok, issues, kind }` so callers can map failures to the
 * installer's exit codes:
 *
 *   kind: "missing"        → lock file absent (treated as fresh)
 *   kind: "schema"         → unsupported contractVersion / schemaVersion (exit 5)
 *   kind: "integrity"      → tampered or malformed on disk (exit 3)
 *   kind: "shape"          → known shape but fields are wrong (exit 3)
 *   kind: "ok"             → lock is supported and intact
 */
export function validateLock(rawLock) {
  if (rawLock === null || rawLock === undefined) {
    return { ok: true, kind: "missing", issues: [] };
  }
  if (typeof rawLock !== "object" || Array.isArray(rawLock)) {
    return { ok: false, kind: "shape", issues: ["lock root must be an object"] };
  }

  const issues = [];
  let kind = "ok";

  // v1 locks (legacy manager-aware schema) are accepted as legacy
  // core so consumers on those versions can upgrade without manual
  // migration. v2+ locks must match the current schema.
  if (
    rawLock.contractVersion !== CURRENT_LOCK_SCHEMA &&
    rawLock.contractVersion !== 1
  ) {
    issues.push(`unsupported contractVersion: ${JSON.stringify(rawLock.contractVersion)} (expected ${CURRENT_LOCK_SCHEMA} or 1)`);
    kind = "schema";
  }

  const manager = rawLock.manager;
  if (manager === undefined) {
    issues.push("manager section missing");
    kind = kind === "ok" ? "shape" : kind;
  } else if (typeof manager !== "object" || manager === null) {
    issues.push("manager section must be an object");
    kind = kind === "ok" ? "shape" : kind;
  } else if (
    manager.schemaVersion !== CURRENT_LOCK_SCHEMA &&
    manager.schemaVersion !== 1
  ) {
    issues.push(`unsupported manager.schemaVersion: ${JSON.stringify(manager.schemaVersion)} (expected ${CURRENT_LOCK_SCHEMA} or 1)`);
    kind = "schema";
  } else if (manager.name !== "opencode-ship") {
    issues.push(`unknown manager.name: ${JSON.stringify(manager.name)}`);
    kind = "shape";
  } else if (
    rawLock.contractVersion === CURRENT_LOCK_SCHEMA &&
    manager.schemaVersion === CURRENT_LOCK_SCHEMA &&
    manager.profile !== undefined &&
    !isValidProfile(manager.profile)
  ) {
    // v2 locks must carry a valid profile. v1 locks (where the
    // profile field is absent) implicitly resolve to core.
    issues.push(`invalid manager.profile: ${JSON.stringify(manager.profile)} (expected one of: core, engineering)`);
    kind = "shape";
  }

  if (!rawLock.files || !Array.isArray(rawLock.files)) {
    issues.push("files must be an array");
    kind = kind === "ok" ? "shape" : kind;
  }

  if (!rawLock.integrity || typeof rawLock.integrity !== "object") {
    issues.push("integrity section missing");
    kind = kind === "ok" ? "shape" : kind;
  } else {
    const expected = computeIntegrity(rawLock).lockSha256;
    if (expected !== rawLock.integrity.lockSha256) {
      issues.push(`integrity mismatch: stored ${rawLock.integrity.lockSha256} != computed ${expected}`);
      kind = "integrity";
    }
  }

  return { ok: issues.length === 0, kind, issues };
}

/**
 * Read + validate in one step. Always returns a discriminated
 * result; never throws. Callers translate `kind` into exit codes.
 */
export async function readValidatedLock(repoRoot) {
  const path = lockPath(repoRoot);
  if (!existsSync(path)) {
    return { kind: "missing", lock: null, issues: [] };
  }
  let raw;
  try {
    const text = await readFile(path, "utf8");
    raw = JSON.parse(text);
  } catch (e) {
    return {
      kind: "integrity",
      lock: null,
      issues: [`unable to parse lock JSON: ${e?.message ?? String(e)}`],
    };
  }
  const validation = validateLock(raw);
  return { kind: validation.kind, lock: validation.ok ? raw : null, issues: validation.issues };
}

export async function migrateLegacyLock(repoRoot) {
  const legacy = resolve(repoRoot, ".opencode", "delivery.lock.json");
  if (!existsSync(legacy)) return null;
  try {
    const raw = await readFile(legacy, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed.contractVersion !== 1 || typeof parsed.adapterSha256 !== "string") return null;
    return {
      kind: "legacy-lock",
      sourcePath: legacy,
      payload: { contractVersion: 1, adapterSha256: parsed.adapterSha256, writtenAt: parsed.writtenAt ?? null },
      sha256: bytesHashString(raw),
    };
  } catch {
    return null;
  }
}
