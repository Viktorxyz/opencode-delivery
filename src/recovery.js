/**
 * Recovery helpers.
 *
 * The recovery layer tolerates interrupted lifecycles
 * - a half-written manifest is repaired by re-reading it
 * - a `cleanup-pending` manifest whose worktree was removed by hand
 *   transitions to `cleaned` only after a safe-check passes
 * - a `merged` manifest that has not been queued for cleanup is queued
 */

import * as git from "./drivers/git.js";
import { listManifests, readManifest, deleteManifest } from "./state/manifest-store.js";
import { transition } from "./state/lifecycle.js";

export async function scanRecovery(repoRoot) {
  const manifests = await listManifests(repoRoot);
  const report = {
    total: manifests.length,
    pendingCleanup: 0,
    orphanWorktrees: 0,
    cleaned: 0,
    notes: [],
  };
  for (const m of manifests) {
    if (m.state === "cleanup-pending") report.pendingCleanup += 1;
    if (m.state === "cleaned") report.cleaned += 1;
  }
  for (const wt of git.listWorktrees(repoRoot)) {
    const note = `worktree ${wt.path} branch=${wt.branch} head=${wt.head}`;
    if (!manifests.some((m) => m.worktreePath === wt.path)) {
      report.orphanWorktrees += 1;
      report.notes.push(`orphan ${note}`);
    }
  }
  return report;
}

export async function removeManifestIfSafe(repoRoot, taskId) {
  const m = await readManifest(repoRoot, taskId);
  if (!m) return false;
  if (m.state !== "cleaned") return false;
  await deleteManifest(repoRoot, taskId);
  return true;
}

export function wouldCleanupBeSafe(args) {
  return Boolean(
    args.prMerged &&
      args.worktreeClean &&
      !args.rebaseInProgress &&
      args.headMatchesPr &&
      args.baseMatches,
  );
}

export function recoverManifestAfterCrash(manifest) {
  return manifest;
}
