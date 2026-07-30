/*
 * opencode-ship command: doctor.
 *
 * Read-only environment, lock, and asset integrity checks. Each
 * check is independent; the report includes every check so callers
 * can see drift, conflicts, and missing pieces at once.
 *
 * Exit codes:
 *   0  healthy
 *   1  unhealthy but no conflicts (warnings about drift)
 *   2  invalid project (no Git root, etc.)
 */

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { readLock, validateIntegrity } from "../lock.js";
import { loadConfig } from "../config.js";
import { detectProject } from "../detection/project.js";
import { resolve } from "node:path";
import { bytesHashString } from "../hash.js";
import { readRootConfig, applyOwnedPointers } from "../root-config.js";
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
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!envToken) {
    return { name: "gh auth status", ok: false, detail: "no GH_TOKEN / GITHUB_TOKEN in environment; gh auth skipped" };
  }
  const r = spawnSync("gh", ["auth", "status"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return {
    name: "gh auth status",
    ok: r.status === 0,
    detail: r.status === 0 ? "authenticated (token)" : ((r.stderr || r.stdout || "").trim() || "no session"),
  };
}

async function checkLock(repoRoot) {
  const lock = await readLock(repoRoot);
  if (!lock) return { name: "lock present", ok: false, detail: "missing" };
  const integrityOk = await validateIntegrity(lock);
  return {
    name: "lock present",
    ok: integrityOk,
    detail: integrityOk ? `v0.2 manager@${lock.manager?.version ?? "?"}` : "integrity mismatch",
  };
}

async function checkConfig(repoRoot) {
  const r = await loadConfig(repoRoot);
  return {
    name: "ship.config.json valid",
    ok: Boolean(r?.ok),
    detail: r?.ok ? "loaded" : r?.error?.kind ?? "missing",
  };
}

function checkPlugin(repoRoot) {
  const path = resolve(repoRoot, ".opencode/plugin/opencode-ship.js");
  if (!existsSync(path)) return { name: "plugin", ok: false, detail: "missing" };
  try {
    const buf = readFileSync(path, "utf8");
    return { name: "plugin", ok: buf.includes("opencode-ship"), detail: "loaded" };
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

async function checkManagedHashes(repoRoot) {
  const lock = await readLock(repoRoot);
  if (!lock) return { name: "managed hashes", ok: false, detail: "no lock" };
  const drift = [];
  for (const entry of lock.files ?? []) {
    const p = resolve(repoRoot, entry.path);
    if (!existsSync(p)) { drift.push(`missing:${entry.path}`); continue; }
    const buf = readFileSync(p, "utf8");
    const actual = bytesHashString(buf);
    if (actual !== entry.sha256) drift.push(`drift:${entry.path}`);
  }
  return { name: "managed hashes", ok: drift.length === 0, detail: drift.length ? drift.join(",") : "match" };
}

async function checkRootConfig(repoRoot) {
  const { findRootConfig } = await import("../root-config.js");
  const candidate = findRootConfig(repoRoot);
  if (!candidate.path) return { name: "root config owned entries", ok: true, detail: "absent (no work)" };
  const result = readRootConfig(candidate.path);
  if (!result.ok) return { name: "root config owned entries", ok: false, detail: `root config ${result.error.kind}` };
  const r = applyOwnedPointers(result.value);
  const conflict = r.skipped.find((s) => s.reason === "different existing value");
  return {
    name: "root config owned entries",
    ok: !conflict,
    detail: conflict
      ? `conflict on ${conflict.pointer}`
      : `applied=${r.applied.length}, skipped=${r.skipped.length}`,
  };
}

function writeEnvelope({ command, plan, summary, diagnostics, json, exitCode }) {
  const conflicts = plan.filter((p) => p.kind === "conflict");
  if (json) {
    process.stdout.write(renderJson({ command, plan, conflicts, summary, diagnostics, exitCode }) + "\n");
  } else {
    process.stdout.write(renderHuman({ command, plan, conflicts, summary, diagnostics }) + "\n");
  }
}

export async function runDoctor({ rootPath, json }) {
  const detection = detectProject(rootPath ?? process.cwd());
  if (detection.errors.some((e) => e.kind === "not-a-git-repo")) {
    const issues = ["not in a git repository"];
    writeEnvelope({ command: "doctor", plan: [], summary: summarise([]), diagnostics: issues, json, exitCode: 2 });
    process.exitCode = 2;
    return { issues, exitCode: 2, plan: [] };
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
    await checkRootConfig(repoRoot),
  ];
  const issues = checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
  const plan = checks.map((c) => ({
    kind: c.ok ? "noop" : "conflict",
    op: "check", target: c.name, relPath: c.name, reason: c.detail,
  }));
  const summary = summarise(plan);
  const exitCode = issues.length === 0 ? 0 : 1;
  writeEnvelope({ command: "doctor", plan, summary, diagnostics: issues, json, exitCode });
  process.exitCode = exitCode;
  return { issues, exitCode, plan };
}
