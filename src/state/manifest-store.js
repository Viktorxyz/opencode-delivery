/**
 * Local lifecycle manifest persistence.
 *
 * Manifests live outside the worktree so they survive worktree removal.
 * They are stored under `<git-common-dir>/opencode-delivery/manifests/<taskId>.json`.
 */

import { readFile, writeFile, rename, mkdir, readdir, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";

async function runGitCommonDir(repoRoot) {
  return new Promise((res, rej) => {
    const proc = spawn(
      "git",
      ["rev-parse", "--path-format=absolute", "--git-common-dir"],
      { cwd: repoRoot, stdio: ["ignore", "pipe", "pipe"], shell: false },
    );
    let out = "";
    proc.stdout.on("data", (d) => (out += d.toString()));
    proc.on("error", rej);
    proc.on("close", (code) => {
      if (code !== 0) {
        rej(new Error(`git rev-parse --git-common-dir failed with ${code}`));
        return;
      }
      const trimmed = out.trim();
      if (!trimmed) {
        rej(new Error("git rev-parse returned an empty path"));
        return;
      }
      res(resolve(repoRoot, trimmed));
    });
  });
}

function manifestPath(commonDir, taskId) {
  return join(commonDir, "opencode-delivery", "manifests", `${taskId}.json`);
}

export async function writeManifest(repoRoot, manifest) {
  const commonDir = await runGitCommonDir(repoRoot);
  const path = manifestPath(commonDir, manifest.taskId);
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(manifest, null, 2) + "\n", "utf8");
  await rename(tmp, path);
  return resolve(path);
}

export async function readManifest(repoRoot, taskId) {
  const commonDir = await runGitCommonDir(repoRoot);
  const path = manifestPath(commonDir, taskId);
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function listManifests(repoRoot) {
  const commonDir = await runGitCommonDir(repoRoot);
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
  const commonDir = await runGitCommonDir(repoRoot);
  const path = manifestPath(commonDir, taskId);
  try {
    await unlink(path);
  } catch {
    // already gone
  }
}
