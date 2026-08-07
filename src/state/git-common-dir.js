/**
 * Shared Git common-directory resolver.
 *
 * Every durable workflow artifact (manifests, transaction journals,
 * immutable approvals, run event logs, resource locks) is stored
 * under the resolved Git common directory so that:
 *
 *   1. main checkouts and their linked worktrees share one state root;
 *   2. worktree deletion does not destroy lifecycle state;
 *   3. the same code path works for a regular repo, a linked worktree,
 *      or a bare repository.
 *
 * The resolver shells out to `git rev-parse --path-format=absolute
 * --git-common-dir` with `shell: false` (argv vector) so the runtime
 * path never interprets a path as a shell command. The returned path
 * is absolute and is anchored under the resolved common dir for
 * downstream helpers like `opencodeShipStateDir`.
 */

import { spawn } from "node:child_process";
import { resolve, join } from "node:path";

const STATE_DIRNAME = "opencode-ship";

/**
 * @typedef {Object} ResolvedCommonDir
 * @property {string} path Absolute path to the common directory.
 * @property {string} stateDir Absolute path under the common directory
 *   where Ship-owned durable artifacts live.
 */

/**
 * Resolve the absolute Git common directory for a repository.
 *
 * @param {string} repoRoot
 *   Absolute or relative path to any checkout of the repository
 *   (main, linked worktree, or bare repo).
 * @returns {Promise<string>} Absolute path to the common directory.
 */
export async function resolveGitCommonDir(repoRoot) {
  if (typeof repoRoot !== "string" || repoRoot.length === 0) {
    throw new Error("resolveGitCommonDir: repoRoot must be a non-empty string");
  }
  return new Promise((resolveP, reject) => {
    const proc = spawn(
      "git",
      ["-C", repoRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { stdio: ["ignore", "pipe", "pipe"], shell: false },
    );
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => { out += d.toString("utf8"); });
    proc.stderr.on("data", (d) => { err += d.toString("utf8"); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(
          `git rev-parse --git-common-dir failed (exit ${code}): ${err.trim() || "unknown error"}`,
        ));
        return;
      }
      const trimmed = out.trim();
      if (!trimmed) {
        reject(new Error("git rev-parse --git-common-dir returned an empty path"));
        return;
      }
      resolveP(resolve(repoRoot, trimmed));
    });
  });
}

/**
 * Absolute path to the opencode-ship state directory under the
 * resolved common directory. State is segmented into per-feature
 * subdirectories so each subsystem can own its own files without
 * stepping on siblings.
 *
 * @param {string} commonDir Absolute path returned by
 *   `resolveGitCommonDir`.
 * @param {...string} segments Optional sub-segments under the state
 *   directory (e.g. "manifests", "locks/alpha").
 * @returns {string} Absolute path under `<commonDir>/<STATE_DIRNAME>`.
 */
export function opencodeShipStateDir(commonDir, ...segments) {
  if (typeof commonDir !== "string" || commonDir.length === 0) {
    throw new Error("opencodeShipStateDir: commonDir must be a non-empty string");
  }
  return join(commonDir, STATE_DIRNAME, ...segments);
}

/**
 * @param {string} repoRoot
 * @returns {Promise<ResolvedCommonDir>}
 */
export async function resolveShipStateRoot(repoRoot) {
  const common = await resolveGitCommonDir(repoRoot);
  return { path: common, stateDir: opencodeShipStateDir(common) };
}
