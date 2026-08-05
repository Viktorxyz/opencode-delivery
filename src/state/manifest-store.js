/**
 * Local lifecycle manifest persistence.
 *
 * Manifests live outside the worktree so they survive worktree removal.
 * They are stored under `<git-common-dir>/opencode-delivery/manifests/<taskId>.json`
 * (the `opencode-delivery/` directory name is preserved for compatibility with existing
 * manifests already on consumers' machines).
 *
 * The shared `resolveGitCommonDir` resolver is the single source of
 * truth for the storage root so main checkouts and their linked
 * worktrees agree on the same state directory.
 */

import { readFile, writeFile, rename, mkdir, readdir, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { open as fsOpen } from "node:fs/promises";

import { resolveGitCommonDir } from "./git-common-dir.js";
import { atomicReplaceJson } from "./durable-store.js";

function manifestPath(commonDir, taskId) {
  return join(commonDir, "opencode-delivery", "manifests", `${taskId}.json`);
}

async function commonDirFromRepoRoot(repoRoot) {
  return resolveGitCommonDir(repoRoot);
}

export async function writeManifest(repoRoot, manifest) {
  const commonDir = await commonDirFromRepoRoot(repoRoot);
  const path = manifestPath(commonDir, manifest.taskId);
  await atomicReplaceJson(path, manifest);
  return resolve(path);
}

export async function readManifest(repoRoot, taskId) {
  const commonDir = await commonDirFromRepoRoot(repoRoot);
  const path = manifestPath(commonDir, taskId);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listManifests(repoRoot) {
  const commonDir = await commonDirFromRepoRoot(repoRoot);
  const dir = join(commonDir, "opencode-delivery", "manifests");
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(dir, name), "utf8");
      out.push(JSON.parse(raw));
    } catch {
      // ignore corrupt manifest
    }
  }
  return out;
}

export async function deleteManifest(repoRoot, taskId) {
  const commonDir = await commonDirFromRepoRoot(repoRoot);
  const path = manifestPath(commonDir, taskId);
  try {
    await unlink(path);
  } catch {
    // already gone
  }
}
