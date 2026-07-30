/*
 * opencode-ship command: diff.
 *
 * Read-only. Prints the same plan init would have run, without any
 * filesystem mutation. Exit 0 if no changes, exit 1 otherwise.
 */

import { detectProject } from "../detection/project.js";
import { readLock } from "../lock.js";
import { planFileInstall } from "../planner.js";
import { renderHuman, renderJson, summarise } from "../report.js";
import { resolve } from "node:path";

export async function runDiff({ rootPath, json }) {
  const detection = detectProject(rootPath ?? process.cwd());
  const repoRoot = detection.repoRoot;
  const lock = await readLock(repoRoot);
  const plan = await planFileInstall({ repoRoot, packageRoot: packageRoot(), lock, allowUnowned: true });
  const conflicts = plan.filter((op) => op.kind === "conflict");
  const summary = summarise(plan);
  const changes = summary.create + summary.update + summary.delete + summary.conflict;
  if (json) {
    process.stdout.write(renderJson({ command: "diff", plan, conflicts, summary, exitCode: changes ? 1 : 0 }) + "\n");
  } else {
    process.stdout.write(renderHuman({ command: "diff", plan, conflicts, summary }) + "\n");
  }
  process.exit(changes ? 1 : 0);
}

function packageRoot() {
  return resolve(new URL("../../../", import.meta.url).pathname);
}
