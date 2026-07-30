/*
 * opencode-ship command: uninstall.
 *
 * Removes managed files whose bytes still match the lock, then
 * removes the lock itself. ship.config.json is preserved unless
 * --purge-config is supplied (in which case the user has confirmed
 * the config can also be removed).
 *
 * Exit 3 on conflict (modified managed file refusing to be deleted).
 */

import { detectProject } from "../detection/project.js";
import { readLock, writeLock } from "../lock.js";
import { planUninstall } from "../planner.js";
import { executePlan } from "../transaction.js";
import { unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderHuman, renderJson, summarise } from "../report.js";
import { configPath } from "../config.js";

export async function runUninstall({ rootPath, json, purgeConfig }) {
  const detection = detectProject(rootPath ?? process.cwd());
  const repoRoot = detection.repoRoot;
  const lock = await readLock(repoRoot);
  if (!lock) {
    return emit({ command: "uninstall", plan: [], conflicts: [], summary: summarise([]), json, exitCode: 0 });
  }
  const plan = await planUninstall({ repoRoot, lock });
  const conflicts = plan.filter((op) => op.kind === "conflict");
  const summary = summarise(plan);
  if (conflicts.length > 0) {
    return emit({ command: "uninstall", plan, conflicts, summary, json, exitCode: 3 });
  }
  const tx = await executePlan({
    repoRoot,
    plan: plan.filter((op) => op.kind !== "conflict" && op.kind !== "noop"),
    newLockBuilder: () => null,
  });
  if (!tx.ok) {
    return emit({ command: "uninstall", plan, conflicts, summary, diagnostics: [tx.error?.message ?? "transaction failure"], json, exitCode: 4 });
  }
  const lockPath = resolve(repoRoot, ".opencode", "ship.lock.json");
  if (existsSync(lockPath)) await unlink(lockPath).catch(() => null);
  if (purgeConfig) {
    await unlink(configPath(repoRoot)).catch(() => null);
  }
  return emit({ command: "uninstall", plan, conflicts, summary, json, exitCode: 0 });
}

function emit({ command, plan, conflicts, summary, diagnostics = [], json, exitCode }) {
  if (json) {
    process.stdout.write(renderJson({ command, plan, conflicts, summary, diagnostics, exitCode }) + "\n");
  } else {
    process.stdout.write(renderHuman({ command, plan, conflicts, summary, diagnostics }) + "\n");
  }
  process.exit(exitCode);
}
