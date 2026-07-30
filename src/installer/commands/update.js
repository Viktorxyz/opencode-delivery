/*
 * opencode-ship command: update.
 *
 * Behaves like `init` except that conflicts are never auto-resolved;
 * the user must restore the managed file or pass --replace-managed to
 * overwrite it explicitly. Without --replace-managed we exit 3 on
 * conflict.
 */

import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { detectProject } from "../detection/project.js";
import { readLock } from "../lock.js";
import { planFileInstall } from "../planner.js";
import { executePlan } from "../transaction.js";
import { renderHuman, renderJson, summarise } from "../report.js";
import { writeConfig, loadConfig, renderDefaultConfig } from "../config.js";
import { CATALOG } from "../catalog.js";
import { bytesHashString } from "../hash.js";

function packageRoot() {
  return resolve(new URL("../../../", import.meta.url).pathname);
}

async function buildNewLock(repoRoot, mutating, source, configOp) {
  const remain = source?.files?.filter((f) => !mutating.some((op) => op.relPath === f.path && (op.kind === "delete" || op.kind === "conflict"))) ?? [];
  for (const op of mutating) {
    if (op.op !== "file") continue;
    if (op.kind === "delete" || op.kind === "conflict") continue;
    const entry = CATALOG.find((entry) => entry.path === op.relPath);
    const buf = await readFile(op.target);
    remain.push({
      path: op.relPath,
      sha256: bytesHashString(buf.toString("utf8")),
      mode: 0o644,
      template: entry?.source,
      kind: entry?.kind,
    });
  }
  return {
    contractVersion: 1,
    manager: {
      schemaVersion: 1,
      name: "opencode-ship",
      version: process.env.OPENCODE_SHIP_VERSION ?? "0.2.0",
      templateSet: "v0.2.0",
      appliedAt: new Date().toISOString(),
      config: {
        path: ".opencode/ship.config.json",
        sha256: configOp?.sha256 ?? "",
        existed: Boolean(configOp),
      },
    },
    files: remain,
    cleanupPending: source?.cleanupPending ?? [],
  };
}

export async function runUpdate({ rootPath, json, replaceManaged, forceConfig }) {
  const detection = detectProject(rootPath ?? process.cwd());
  const repoRoot = detection.repoRoot;
  const lock = await readLock(repoRoot);
  const plan = await planFileInstall({ repoRoot, packageRoot: packageRoot(), lock, allowUnowned: !replaceManaged });
  const conflicts = plan.filter((op) => op.kind === "conflict");
  const summary = summarise(plan);
  if (conflicts.length > 0 && !replaceManaged) {
    return emit({ command: "update", plan, conflicts, summary, json, exitCode: 3 });
  }

  let configOp = await loadConfig(repoRoot);
  if (!configOp?.ok || forceConfig) {
    const written = await writeConfig(repoRoot, renderDefaultConfig(detection));
    configOp = {
      ok: true,
      path: written.path,
      raw: written.raw,
      sha256: written.sha256,
      canonicalSha256: written.sha256,
      value: renderDefaultConfig(detection),
    };
  }

  const mutating = plan.filter((op) => op.kind !== "conflict" && op.kind !== "noop" && op.kind !== "converge");
  const tx = await executePlan({
    repoRoot,
    plan: mutating,
    newLockBuilder: async () => await buildNewLock(repoRoot, mutating, lock, configOp),
  });
  if (!tx.ok) {
    return emit({ command: "update", plan, conflicts, summary, diagnostics: [tx.error?.message ?? "transaction failure"], json, exitCode: 4 });
  }
  return emit({ command: "update", plan, conflicts, summary, json, exitCode: 0 });
}

function emit({ command, plan, conflicts, summary, diagnostics = [], json, exitCode }) {
  if (json) {
    process.stdout.write(renderJson({ command, plan, conflicts, summary, diagnostics, exitCode }) + "\n");
  } else {
    process.stdout.write(renderHuman({ command, plan, conflicts, summary, diagnostics }) + "\n");
  }
  process.exit(exitCode);
}
