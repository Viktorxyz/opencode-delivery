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
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { bytesHashString } from "./hash.js";
import { stableStringify } from "./json-pointer.js";

export const CURRENT_LOCK_SCHEMA = 1;

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
