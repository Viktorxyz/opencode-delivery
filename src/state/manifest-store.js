/**
 * Local lifecycle manifest persistence.
 *
 * Manifests live outside the worktree so they survive worktree removal.
 * The canonical storage path is
 * `<git-common-dir>/opencode-ship/delivery/manifests/<taskId>.json`.
 *
 * The pre-0.9.0 manifest directory `<git-common-dir>/opencode-delivery/manifests/`
 * is honoured as a one-time read-only migration source. Once a manifest
 * has been read or written through the canonical path, the legacy
 * directory is not consulted again for that taskId.
 *
 * The shared `resolveGitCommonDir` resolver is the single source of
 * truth for the storage root so main checkouts and their linked
 * worktrees agree on the same state directory.
 */

import { readFile, readdir, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

import { resolveGitCommonDir } from "./git-common-dir.js";
import { atomicReplaceJson } from "./durable-store.js";

const SHIP_DIRNAME = "opencode-ship";
const LEGACY_DIRNAME = "opencode-delivery";

function canonicalManifestPath(commonDir, taskId) {
  return join(commonDir, SHIP_DIRNAME, "delivery", "manifests", `${taskId}.json`);
}

function legacyManifestPath(commonDir, taskId) {
  return join(commonDir, LEGACY_DIRNAME, "manifests", `${taskId}.json`);
}

async function commonDirFromRepoRoot(repoRoot) {
  return resolveGitCommonDir(repoRoot);
}

async function readJsonOrNull(path) {
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeManifest(repoRoot, manifest) {
  const commonDir = await commonDirFromRepoRoot(repoRoot);
  const path = canonicalManifestPath(commonDir, manifest.taskId);
  await atomicReplaceJson(path, manifest);
  return resolve(path);
}

export async function readManifest(repoRoot, taskId) {
  const commonDir = await commonDirFromRepoRoot(repoRoot);
  const canonical = await readJsonOrNull(canonicalManifestPath(commonDir, taskId));
  if (canonical !== null) return canonical;
  const legacy = await readJsonOrNull(legacyManifestPath(commonDir, taskId));
  if (legacy !== null) return legacy;
  return null;
}

export async function listManifests(repoRoot) {
  const commonDir = await commonDirFromRepoRoot(repoRoot);
  const canonicalDir = join(commonDir, SHIP_DIRNAME, "delivery", "manifests");
  const legacyDir = join(commonDir, LEGACY_DIRNAME, "manifests");
  const out = [];
  const seen = new Set();
  for (const dir of [canonicalDir, legacyDir]) {
    let names;
    try {
      names = await readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".json")) continue;
      if (seen.has(name)) continue;
      const parsed = await readJsonOrNull(join(dir, name));
      if (parsed !== null) {
        seen.add(name);
        out.push(parsed);
      }
    }
  }
  return out;
}

export async function deleteManifest(repoRoot, taskId) {
  const commonDir = await commonDirFromRepoRoot(repoRoot);
  const canonical = canonicalManifestPath(commonDir, taskId);
  const legacy = legacyManifestPath(commonDir, taskId);
  await unlink(canonical).catch(() => null);
  await unlink(legacy).catch(() => null);
}
