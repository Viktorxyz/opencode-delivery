/*
 * Install-manifest persistence.
 *
 * Locks live at .opencode/ship.lock.json. This module handles
 * read, write, schema validation, and v0.1.x -> v0.2.x migration.
 *
 * For migrated consumers, the legacy `.opencode/delivery.lock.json`
 * fields `contractVersion`, `adapterSha256`, and `writtenAt` are
 * preserved alongside the new `manager` block so legacy doctor
 * checks remain happy. New consumers do not get them.
 *
 * The lock digest is computed over its own contents *minus* the
 * `integrity.lockSha256` field to avoid self-reference.
 */

import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { bytesHashString } from "./hash.js";

export const CURRENT_LOCK_SCHEMA = 1;

export function lockPath(repoRoot) {
  return resolve(repoRoot, ".opencode", "ship.lock.json");
}

export async function readLock(repoRoot) {
  const path = lockPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeLock(repoRoot, lock) {
  const path = lockPath(repoRoot);
  await mkdir(dirname(path), { recursive: true });
  const { integrity, ...rest } = lock;
  void integrity;
  const finalLock = {
    ...rest,
    integrity: {
      lockSha256: bytesHashString(
        JSON.stringify({ ...rest, integrity: { lockSha256: "" } }),
      ),
    },
  };
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(finalLock, null, 2) + "\n", "utf8");
  await rename(tmp, path);
  return path;
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
      payload: parsed,
    };
  } catch {
    return null;
  }
}
