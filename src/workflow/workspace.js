/**
 * Workspace manifest.
 *
 * Reproducible inventory of the worktree after a builder
 * dispatch. The manifest lists every file the builder
 * touched (added, modified, deleted, binary, untracked) and
 * the result hashes them in a stable order so the controller
 * can:
 *
 *   - commit only the reviewed task's paths,
 *   - reject a workspace that has changed files outside the
 *     task brief's reviewed paths,
 *   - detect a dirty worktree before the commit,
 *   - reproduce the workspace hash on resume.
 *
 * The manifest is computed from a `git status --porcelain`
 * snapshot plus a hash of every working-tree file. It is
 * independent of the builder's report so the controller can
 * verify the report's claim.
 */

import { spawnSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";

/**
 * @typedef {Object} WorkspaceEntry
 * @property {"added" | "modified" | "deleted" | "untracked" | "binary"} status
 * @property {string} path Repo-relative path.
 * @property {string} [sha256] Hex SHA-256 of the working-tree bytes; absent for deleted entries.
 */

/**
 * @typedef {Object} WorkspaceManifest
 * @property {string} repoRoot
 * @property {string} headSha HEAD SHA at the time of the snapshot.
 * @property {WorkspaceEntry[]} entries
 * @property {string} hash Stable hash of the canonical entries.
 */

/**
 * Capture a workspace manifest for `repoRoot`. The function
 * shells out to `git status --porcelain` with `shell: false`
 * to enumerate the changed files, then hashes the working
 * tree for every non-deleted entry.
 *
 * @param {string} repoRoot
 * @returns {Promise<WorkspaceManifest>}
 */
export async function captureWorkspaceManifest(repoRoot) {
  if (typeof repoRoot !== "string" || repoRoot.length === 0) {
    throw new Error("captureWorkspaceManifest: repoRoot must be a non-empty string");
  }
  const status = spawnSync("git", ["-C", repoRoot, "status", "--porcelain", "--untracked-files=all", "--ignored=no"], {
    encoding: "utf8",
  });
  if (status.status !== 0) {
    throw new Error(`captureWorkspaceManifest: git status failed: ${status.stderr || status.stdout}`);
  }
  const head = spawnSync("git", ["-C", repoRoot, "rev-parse", "HEAD"], { encoding: "utf8" });
  const headSha = (head.stdout ?? "").trim();
  const entries = [];
  const lines = (status.stdout ?? "").split("\n").filter((l) => l.length > 0);
  for (const line of lines) {
    // porcelain v1: XY PATH
    // porcelain v2: 1 XY PATH or 2 XY PATH ORIG
    // We use v1 for simplicity.
    if (line.length < 4) continue;
    const x = line[0];
    const y = line[1];
    let path = line.slice(3);
    // Handle rename / copy arrows: "old -> new" appears in v1.
    if (path.includes("->")) {
      const parts = path.split("->").map((p) => p.trim());
      path = parts[1] ?? parts[0];
    }
    // Strip surrounding quotes from git status --porcelain.
    if (path.startsWith('"') && path.endsWith('"')) path = path.slice(1, -1);
    const status = mapStatus(x, y);
    const entry = { status, path };
    if (status !== "deleted") {
      const abs = join(repoRoot, path);
      if (existsSync(abs)) {
        const buf = await readFile(abs);
        if (buf.includes(0)) {
          entry.status = "binary";
        }
        entry.sha256 = sha256(buf);
      }
    }
    entries.push(entry);
  }
  entries.sort((a, b) => a.path < b.path ? -1 : a.path === b.path ? 0 : 1);
  return { repoRoot, headSha, entries, hash: hashEntries(entries) };
}

function mapStatus(x, y) {
  if (x === "?" && y === "?") return "untracked";
  if (x === "!" && y === "!") return "ignored";
  if (x === "A" || y === "A") return "added";
  if (x === "D" || y === "D") return "deleted";
  if (x === "M" || y === "M" || x === "T" || y === "T") return "modified";
  return "modified";
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

function hashEntries(entries) {
  const canon = entries.map((e) => `${e.status}:${e.path}:${e.sha256 ?? ""}`).join("|");
  return sha256(Buffer.from(canon, "utf8"));
}

/**
 * Returns the set of paths in a manifest as a `Set<string>`.
 * Used by the controller to commit only the reviewed paths.
 *
 * @param {WorkspaceManifest} manifest
 * @returns {Set<string>}
 */
export function manifestPaths(manifest) {
  const out = new Set();
  for (const e of manifest.entries) out.add(e.path);
  return out;
}

/**
 * Return the subset of a manifest whose path is in `allowed`.
 *
 * @param {WorkspaceManifest} manifest
 * @param {Set<string> | string[]} allowed
 * @returns {WorkspaceEntry[]}
 */
export function filterManifestToPaths(manifest, allowed) {
  const set = allowed instanceof Set ? allowed : new Set(allowed);
  return manifest.entries.filter((e) => set.has(e.path));
}

/**
 * Check that every entry in `manifest` is in `allowed`. The
 * controller refuses to commit when a builder has touched a
 * path outside the task brief.
 *
 * @param {WorkspaceManifest} manifest
 * @param {Set<string> | string[]} allowed
 * @returns {{ ok: boolean, outOfScope: string[] }}
 */
export function assertManifestInScope(manifest, allowed) {
  const set = allowed instanceof Set ? allowed : new Set(allowed);
  const outOfScope = [];
  for (const e of manifest.entries) {
    if (!set.has(e.path)) outOfScope.push(e.path);
  }
  return { ok: outOfScope.length === 0, outOfScope };
}

void relative;
void sep;
void readdir;
void stat;
