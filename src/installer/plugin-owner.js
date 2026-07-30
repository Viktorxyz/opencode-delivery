/*
 * Resolve the value used for the `owner` field in delivery manifests
 * and GitHub comments. Falls back to the local git user.name, then to
 * process.env.USER, then to a generic placeholder.
 */

import { spawnSync } from "node:child_process";

export async function reconcileOwner(repoRoot, adapter) {
  const r = spawnSync("git", ["-C", repoRoot, "config", "--get", "user.name"], {
    encoding: "utf8",
  });
  if (r.status === 0 && r.stdout.trim()) return r.stdout.trim();
  return process.env.USER ?? process.env.USERNAME ?? "opencode-ship";
}
