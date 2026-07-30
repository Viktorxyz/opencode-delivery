/*
 * Reconciliation planner.
 *
 * Compares the current on-disk bytes against the desired bytes and
 * against the previous lock to produce an immutable, ordered plan.
 * The plan is then handed to the transaction executor; the planner
 * never touches disk.
 *
 * Each plan entry has:
 *   - kind:    "create" | "update" | "noop" | "delete" | "converge" | "conflict"
 *   - op:      the file operation type ("file", "config", "root-config")
 *   - target:  the absolute target path or root-config descriptor
 *   - bytes:   the desired bytes (create/update only)
 *   - reason:  a human-readable reason for the action
 *
 * Conflict kinds are NEVER applied. The CLI converts them into a
 * precise conflict report and bails out.
 */

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { CATALOG } from "./catalog.js";
import { bytesHashString } from "./hash.js";
import { loadConfig, renderDefaultConfig, writeConfig } from "./config.js";

export async function readBytes(path) {
  if (!existsSync(path)) return null;
  const buf = await readFile(path);
  return { bytes: buf, hash: bytesHashString(buf.toString("utf8")), mode: (await stat(path)).mode & 0o777 };
}

async function loadDesiredBytes(source, packageRoot) {
  const path = source.startsWith("/") ? source : `${packageRoot}/${source}`;
  const buf = await readFile(path);
  return { bytes: buf, hash: bytesHashString(buf.toString("utf8")), mode: 0o644 };
}

function lookupLockedFile(lock, targetPath) {
  if (!lock?.files) return null;
  for (const entry of lock.files) {
    if (entry.path === targetPath) return entry;
  }
  return null;
}

export async function planFileInstall({ repoRoot, packageRoot, lock, allowUnowned = false }) {
  const plan = [];
  for (const entry of CATALOG) {
    const targetPath = `${repoRoot}/${entry.path}`;
    const locked = lookupLockedFile(lock, entry.path);
    const current = await readBytes(targetPath);
    const desired = await loadDesiredBytes(entry.source, packageRoot);
    const previousHash = locked?.sha256 ?? null;

    if (!current) {
      plan.push({
        kind: "create",
        op: "file",
        target: targetPath,
        relPath: entry.path,
        kindOf: entry.kind,
        bytes: desired.bytes,
        mode: entry.mode ?? 0o644,
        template: entry.source,
        sha256: desired.hash,
        reason: "managed file missing",
      });
      continue;
    }
    if (previousHash === current.hash && desired.hash === current.hash) {
      plan.push({ kind: "noop", op: "file", target: targetPath, relPath: entry.path });
      continue;
    }
    if (previousHash !== null && previousHash === current.hash && desired.hash !== current.hash) {
      plan.push({
        kind: "update",
        op: "file",
        target: targetPath,
        relPath: entry.path,
        bytes: desired.bytes,
        mode: entry.mode ?? 0o644,
        template: entry.source,
        sha256: desired.hash,
        reason: "safe update: previous lock matches current bytes",
      });
      continue;
    }
    if (previousHash !== current.hash && desired.hash === current.hash) {
      plan.push({
        kind: "converge",
        op: "file",
        target: targetPath,
        relPath: entry.path,
        reason: "current bytes already equal desired; refresh lock only",
      });
      continue;
    }
    if (allowUnowned && previousHash === null) {
      // First install when target bytes match the upstream bytes:
      // adopt without overwriting.
      plan.push({
        kind: "converge",
        op: "file",
        target: targetPath,
        relPath: entry.path,
        reason: "adopt unowned file whose bytes match desired",
      });
      continue;
    }
    plan.push({
      kind: "conflict",
      op: "file",
      target: targetPath,
      relPath: entry.path,
      currentSha: current.hash,
      previousSha: previousHash,
      desiredSha: desired.hash,
      reason: previousHash === null
        ? "managed file already exists; bytes differ from upstream"
        : "managed file is locally modified",
    });
  }
  return plan;
}

export async function planUninstall({ repoRoot, lock }) {
  const plan = [];
  if (!lock) {
    return plan;
  }
  for (const entry of lock.files ?? []) {
    const targetPath = `${repoRoot}/${entry.path}`;
    const current = await readBytes(targetPath);
    if (!current) continue;
    if (current.hash !== entry.sha256) {
      plan.push({
        kind: "conflict",
        op: "file",
        target: targetPath,
        relPath: entry.path,
        reason: "managed file has been locally modified; refusing to delete",
      });
      continue;
    }
    plan.push({
      kind: "delete",
      op: "file",
      target: targetPath,
      relPath: entry.path,
    });
  }
  return plan;
}

export async function planConfigChange({ repoRoot, detection, lock, configOverride, writeConfigIfMissing }) {
  const existing = await loadConfig(repoRoot);
  const previouslyHad = (lock?.manager?.config?.existed ?? false) || Boolean(existing);
  if (existing && !configOverride) {
    return {
      op: "config",
      action: existing.ok ? "noop" : "conflict",
      path: existing.ok ? existing.path : existing.error.path,
      previousSha: existing.ok ? existing.sha256 : null,
      desiredSha: existing.ok ? existing.sha256 : null,
      reason: existing.ok ? "user config already present" : "config parse failure",
    };
  }
  const desiredValue = configOverride ?? renderDefaultConfig(detection);
  const desiredJson = JSON.stringify(desiredValue, null, 2) + "\n";
  const desiredSha = bytesHashString(desiredJson);
  if (!existing && writeConfigIfMissing) {
    await writeConfig(repoRoot, desiredValue).catch(() => null);
  }
  return {
    op: "config",
    action: existing ? "noop" : "create",
    path: existing?.path ?? `${repoRoot}/.opencode/ship.config.json`,
    previousSha: existing?.sha256 ?? null,
    desiredSha,
    bytes: desiredJson,
    previouslyHad,
    reason: existing
      ? "config unchanged"
      : "synthesising a default config from detection",
  };
}
