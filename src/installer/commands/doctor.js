/*
 * opencode-ship command: doctor.
 *
 * Read-only environment, lock, and asset integrity checks. Each
 * check is independent; the report includes every check so callers
 * can see drift, conflicts, and missing pieces at once.
 *
 * Exit code:
 *   0  healthy
 *   1  unhealthy but no conflicts (warnings about drift)
 *   2  invalid project (no Git root, etc.)
 */

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { readLock } from "../lock.js";
import { loadConfig } from "../config.js";
import { CATALOG } from "../catalog.js";
import { detectProject } from "../detection/project.js";
import { resolve } from "node:path";
import { bytesHashString } from "../hash.js";
import { applyOwnedPointers } from "../root-config.js";
import { renderHuman, renderJson, summarise } from "../report.js";

function checkNode() {
  return { name: "node>=22.6.0", ok: /^v2[2-9]/.test(process.version), detail: process.version };
}

function checkGit() {
  const r = spawnSync("git", ["--version"], { encoding: "utf8" });
  return { name: "git installed", ok: r.status === 0, detail: r.status === 0 ? r.stdout.trim() : "git not on PATH" };
}

function checkGh() {
  const r = spawnSync("gh", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { name: "gh installed", ok: r.status === 0, detail: r.status === 0 ? r.stdout.trim() : "gh CLI not on PATH" };
}

function checkGhAuth() {
  const r = spawnSync("gh", ["auth", "status"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { name: "gh auth status", ok: r.status === 0, detail: r.status === 0 ? r.stdout.trim() : (r.stderr || r.stdout || "").trim() };
}

function checkLock(repoRoot) {
  return readLock(repoRoot).then((lock) => ({
    name: "lock present",
    ok: Boolean(lock),
    detail: lock ? `v0.2 manager@${lock.manager?.version ?? "?"}` : "missing",
  }));
}

function checkConfig(repoRoot) {
  return loadConfig(repoRoot).then((r) => ({
    name: "ship.config.json valid",
    ok: Boolean(r?.ok),
    detail: r?.ok ? "loaded" : r?.error?.kind ?? "missing",
  }));
}

function checkPlugin(repoRoot) {
  const path = resolve(repoRoot, ".opencode/plugin/opencode-ship.js");
  if (!existsSync(path)) return { name: "plugin", ok: false, detail: "missing" };
  try {
    const buf = readFileSync(path);
    return { name: "plugin", ok: buf.toString("utf8").includes("opencode-ship"), detail: "loaded" };
  } catch (e) {
    return { name: "plugin", ok: false, detail: e.message };
  }
}

function checkAgents(repoRoot) {
  const reviewer = resolve(repoRoot, ".opencode/agents/delivery-reviewer.md");
  const verifier = resolve(repoRoot, ".opencode/agents/delivery-verifier.md");
  return {
    name: "canonical agents",
    ok: existsSync(reviewer) && existsSync(verifier),
    detail: existsSync(reviewer) && existsSync(verifier) ? "loaded" : "missing",
  };
}

function checkSkills(repoRoot) {
  const a = resolve(repoRoot, ".opencode/skills/delivery-workflow/SKILL.md");
  const b = resolve(repoRoot, ".opencode/skills/planning-research-checkpoint/SKILL.md");
  return {
    name: "canonical skills",
    ok: existsSync(a) && existsSync(b),
    detail: existsSync(a) && existsSync(b) ? "loaded" : "missing",
  };
}

function checkManagedHashes(repoRoot) {
  return readLock(repoRoot).then(async (lock) => {
    if (!lock) return { name: "managed hashes", ok: false, detail: "no lock" };
    const drift = [];
    for (const entry of lock.files ?? []) {
      const path = resolve(repoRoot, entry.path);
      if (!existsSync(path)) { drift.push(`missing:${entry.path}`); continue; }
      const buf = readFileSync(path);
      const actual = bytesHashString(buf.toString("utf8"));
      if (actual !== entry.sha256) drift.push(`drift:${entry.path}`);
    }
    return { name: "managed hashes", ok: drift.length === 0, detail: drift.length ? drift.join(",") : "match" };
  });
}

function checkRootConfig(repoRoot) {
  const path = resolve(repoRoot, "opencode.json");
  const pathJsonc = resolve(repoRoot, "opencode.jsonc");
  if (!existsSync(path) && !existsSync(pathJsonc)) return { name: "root config present", ok: true, detail: "absent (no work)" };
  if (existsSync(path) && existsSync(pathJsonc)) return { name: "root config present", ok: false, detail: "both opencode.json and .jsonc exist" };
  const target = existsSync(path) ? path : pathJsonc;
  const raw = JSON.parse(readFileSync(target, "utf8"));
  const result = applyOwnedPointers(raw);
  return { name: "root config owned entries", ok: result.skipped.every((s) => s.reason !== "different existing value"), detail: `applied=${result.applied.length}, skipped=${result.skipped.length}` };
}

export async function runDoctor({ rootPath, json, writeOutput = true }) {
  const detection = detectProject(rootPath ?? process.cwd());
  if (detection.errors.some((e) => e.kind === "not-a-git-repo")) {
    return { issues: ["not in a git repository"], exitCode: 2, plan: [], conflicts: [], summary: summarise([]), diagnostics: ["not in a git repository"] };
  }
  const repoRoot = detection.repoRoot;
  const checks = [
    checkNode(),
    checkGit(),
    checkGh(),
    checkGhAuth(),
    await checkLock(repoRoot),
    await checkConfig(repoRoot),
    checkPlugin(repoRoot),
    checkAgents(repoRoot),
    checkSkills(repoRoot),
    await checkManagedHashes(repoRoot),
    checkRootConfig(repoRoot),
  ];
  const issues = checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
  const plan = checks.map((c, i) => ({ kind: c.ok ? "noop" : "conflict", op: "check", target: c.name, relPath: c.name, reason: c.detail }));
  const summary = summarise(plan);
  const exitCode = issues.length === 0 ? 0 : 1;
  if (writeOutput) {
    if (json) {
      process.stdout.write(renderJson({ command: "doctor", plan, conflicts: [], summary, diagnostics: issues, exitCode }) + "\n");
    } else {
      process.stdout.write(renderHuman({ command: "doctor", plan, conflicts: [], summary, diagnostics: issues }) + "\n");
    }
  }
  if (!writeOutput) return { issues, exitCode, plan, conflicts: [], summary, diagnostics: issues };
  return { issues, exitCode };
}
