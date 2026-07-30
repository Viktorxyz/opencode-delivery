/*
 * opencode-ship command: init.
 *
 * Plan-then-promote semantics:
 *   1. Detect the project
 *   2. Read the existing lock (legacy-aware)
 *   3. Build a plan with the file reconciliation algorithm
 *   4. Adopt unowned files when their bytes match our desired bytes
 *      (opt-in: this is the default for first installs)
 *   5. Promote the plan as a recoverable transaction
 *   6. Run a final doctor pass before returning
 *
 * No mutation is performed unless the plan is conflict-free and the
 * transaction commits successfully. The exit codes follow the agreed
 * scheme.
 */

import { detectProject } from "../detection/project.js";
import { readLock } from "../lock.js";
import { planFileInstall, planConfigChange } from "../planner.js";
import { executePlan } from "../transaction.js";
import { renderDefaultConfig, writeConfig, loadConfig } from "../config.js";
import { CATALOG, getTemplateSet } from "../catalog.js";
import { renderHuman, renderJson, summarise } from "../report.js";
import { readFile } from "node:fs/promises";
import { bytesHashString } from "../hash.js";
import { resolve } from "node:path";
import { runDoctor } from "./doctor.js";

export async function runInit({ rootPath, configPath, json, forceConfig }) {
  const detection = detectProject(rootPath ?? process.cwd());
  if (detection.errors.some((e) => e.kind === "not-a-git-repo")) {
    return exitWith(2, "not in a Git repository", [], json);
  }
  const repoRoot = detection.repoRoot;
  const lock = await readLock(repoRoot);
  const plan = await planFileInstall({ repoRoot, packageRoot: packageRoot(), lock, allowUnowned: true });

  let configOp = null;
  const existingConfig = await loadConfig(repoRoot);
  if (!existingConfig || !existingConfig.ok) {
    configOp = await writeConfig(repoRoot, renderDefaultConfig(detection));
  } else if (forceConfig) {
    configOp = await writeConfig(repoRoot, renderDefaultConfig(detection));
  } else {
    configOp = existingConfig;
  }

  const conflicts = plan.filter((op) => op.kind === "conflict");
  if (conflicts.length > 0 && !json) {
    return emit({
      command: "init",
      plan,
      conflicts,
      summary: summarise(plan),
      json,
      exitCode: 3,
    });
  }

  const mutatingPlan = plan.filter((op) => op.kind !== "conflict" && op.kind !== "noop" && op.kind !== "converge");
  const lockBuilder = async () =>
    await buildLock({
      repoRoot,
      plan: mutatingPlan,
      configOp,
      source: lock,
      cleanupPending: lock?.cleanupPending ?? [],
    });
  const tx = await executePlan({
    repoRoot,
    plan: mutatingPlan,
    newLockBuilder: lockBuilder,
  });

  if (!tx.ok) {
    return exitWith(4, tx.error?.message ?? "transaction failed", [], json);
  }

  const doctor = await runDoctor({ rootPath: repoRoot, json: false, writeOutput: false });
  if (doctor.issues.length > 0) {
    return emit({
      command: "init",
      plan,
      conflicts,
      summary: summarise(plan),
      diagnostics: doctor.issues,
      json,
      exitCode: doctor.exitCode ?? 1,
    });
  }

  return emit({
    command: "init",
    plan,
    conflicts,
    summary: summarise(plan),
    json,
    exitCode: 0,
  });
}

function packageRoot() {
  // The bundled CLI runs from `dist/`. The templates and plugin live
  // alongside it inside the package.
  return resolve(new URL("../../../", import.meta.url).pathname);
}

function exitWith(code, message, diagnostics, json) {
  if (json) {
    process.stdout.write(renderJson({
      command: "init",
      plan: [],
      conflicts: [],
      summary: summarise([]),
      diagnostics: [...diagnostics, message],
      exitCode: code,
    }) + "\n");
  } else {
    process.stdout.write(`opencode-ship: ${message}\n`);
  }
  process.exit(code);
}

async function buildLock({ repoRoot, plan, configOp, source, cleanupPending }) {
  const files = [];
  for (const op of plan) {
    if (op.op !== "file") continue;
    if (op.kind === "conflict" || op.kind === "noop") continue;
    if (op.kind === "delete") continue;
    const entry = CATALOG.find((entry) => entry.path === op.relPath);
    if (!entry) continue;
    if (op.kind === "create" || op.kind === "update") {
      const buf = await readFile(op.target);
      files.push({
        path: op.relPath,
        sha256: bytesHashString(buf.toString("utf8")),
        mode: 0o644,
        template: entry.source,
        kind: entry.kind,
      });
    } else if (op.kind === "converge") {
      const buf = await readFile(op.target);
      const prev = source?.files?.find((f) => f.path === op.relPath);
      files.push({
        path: op.relPath,
        sha256: bytesHashString(buf.toString("utf8")),
        mode: 0o644,
        template: entry?.source ?? prev?.template,
        kind: entry?.kind ?? prev?.kind,
      });
    }
  }
  return {
    contractVersion: 1,
    manager: {
      schemaVersion: 1,
      name: "opencode-ship",
      version: process.env.OPENCODE_SHIP_VERSION ?? "0.2.0",
      templateSet: getTemplateSet(),
      appliedAt: new Date().toISOString(),
      config: {
        path: ".opencode/ship.config.json",
        sha256: configOp?.sha256 ?? "",
        existed: Boolean(source?.manager?.config?.existed),
      },
    },
    files,
    cleanupPending,
  };
}

function emit({ command, plan, conflicts, summary, diagnostics = [], json, exitCode }) {
  if (json) {
    process.stdout.write(renderJson({ command, plan, conflicts, summary, diagnostics, exitCode }) + "\n");
  } else {
    process.stdout.write(renderHuman({ command, plan, conflicts, summary, diagnostics }) + "\n");
  }
  process.exit(exitCode);
}
