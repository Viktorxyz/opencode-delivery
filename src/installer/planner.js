/*
 * Reconciliation planner.
 *
 * Compares the current on-disk bytes against the desired bytes and
 * against the previous lock to produce an immutable, ordered plan.
 * The plan covers:
 *   - file operations (managed plugin, agents, skills, ship.config.json,
 *     ship.lock.json);
 *   - root opencode.json / opencode.jsonc operations (Build-agent
 *     permissions only, expressed as JSON pointer edits);
 *   - config synthesis (only if absent and allowed).
 *
 * Each entry has:
 *   - kind:    "create" | "update" | "noop" | "delete" | "converge" | "conflict"
 *   - op:      the operation type ("file", "config", "root-config")
 *   - target:  the absolute path or root-config descriptor
 *   - bytes:   the desired bytes (create/update only)
 *   - reason:  a human-readable reason
 *
 * `noop`/`converge` actions do not require file writes but may
 * require lock refresh. `conflict` actions are NEVER applied; the
 * CLI converts them into a precise conflict report and bails out.
 */

import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { CATALOG, catalogForProfile } from "./catalog.js";
import { bytesHashString } from "./hash.js";
import { loadConfig, renderDefaultConfig } from "./config.js";
import {
  setPointer,
  getPointer,
  stableStringify,
} from "./json-pointer.js";
import { POINTER_ENTRIES, applyOwnedPointers } from "./root-config.js";
import { findRootConfig, readRootConfig, defaultRootConfigPath } from "./root-config.js";

async function readBytes(path) {
  if (!existsSync(path)) return null;
  const buf = await readFile(path);
  const fileStat = await stat(path);
  return { bytes: buf, hash: bytesHashString(buf.toString("utf8")), mode: fileStat.mode & 0o777 };
}

async function readDesiredBytes(source) {
  if (!source || !existsSync(source)) return null;
  const buf = await readFile(source);
  return { bytes: buf, hash: bytesHashString(buf.toString("utf8")) };
}

function lookupLockedFile(lock, targetPath) {
  if (!lock?.files) return null;
  return lock.files.find((entry) => entry.path === targetPath) ?? null;
}

async function planManagedFile({ entry, repoRoot, lock, allowUnowned }) {
  const targetPath = `${repoRoot}/${entry.path}`;
  const locked = lookupLockedFile(lock, entry.path);
  const current = await readBytes(targetPath);
  const desired = await readDesiredBytes(entry.source);
  if (!current) {
    return {
      kind: "create", op: "file", target: targetPath, relPath: entry.path,
      kindOf: entry.kind, bytes: desired?.bytes ?? Buffer.alloc(0),
      sha256: desired?.hash, mode: 0o644, reason: "managed file missing",
    };
  }
  if (desired.hash === current.hash) {
    if (locked?.sha256 === current.hash) {
      return { kind: "noop", op: "file", target: targetPath, relPath: entry.path };
    }
    return {
      kind: "converge", op: "file", target: targetPath, relPath: entry.path,
      reason: "current bytes already equal desired; refresh lock only",
    };
  }
  if (locked?.sha256 === current.hash) {
    return {
      kind: "update", op: "file", target: targetPath, relPath: entry.path,
      bytes: desired?.bytes ?? Buffer.alloc(0),
      sha256: desired?.hash, mode: 0o644,
      reason: "safe update: previous lock matches current bytes",
    };
  }
  if (locked?.sha256 && locked.sha256 !== current.hash && allowUnowned) {
    return {
      kind: "update", op: "file", target: targetPath, relPath: entry.path,
      bytes: desired?.bytes ?? Buffer.alloc(0),
      sha256: desired?.hash, mode: 0o644,
      reason: "force update: lock present, current bytes modified",
    };
  }
  return {
    kind: "conflict", op: "file", target: targetPath, relPath: entry.path,
    currentSha: current.hash, previousSha: locked?.sha256 ?? null, desiredSha: desired?.hash,
    reason: locked?.sha256 == null
      ? "managed file already exists; bytes differ from upstream"
      : "managed file is locally modified",
  };
}

export async function planFileInstall({ repoRoot, lock, allowUnowned = false, profile = "core" }) {
  const plan = [];
  for (const entry of catalogForProfile(profile)) {
    plan.push(await planManagedFile({ entry, repoRoot, lock, allowUnowned }));
  }
  return plan;
}

export async function planUninstall({ repoRoot, lock }) {
  if (!lock) return [];
  const plan = [];
  for (const entry of lock.files ?? []) {
    const targetPath = `${repoRoot}/${entry.path}`;
    const current = await readBytes(targetPath);
    if (!current) continue;
    if (current.hash !== entry.sha256) {
      plan.push({
        kind: "conflict", op: "file", target: targetPath, relPath: entry.path,
        reason: "managed file is locally modified; refusing to delete",
      });
      continue;
    }
    plan.push({ kind: "delete", op: "file", target: targetPath, relPath: entry.path });
  }
  return plan;
}

export async function planConfigSynthesis({ repoRoot, detection, lock, forceOverwrite, migrationSeed = null, profile = "core" }) {
  const existing = await loadConfig(repoRoot);
  if (existing?.ok && !forceOverwrite) {
    return {
      kind: "noop",
      op: "config",
      relPath: ".opencode/ship.config.json",
      target: existing.path,
      currentSha: existing.sha256,
      desiredSha: existing.sha256,
      configValue: existing.value,
      reason: "user config already present",
    };
  }
  const desiredValue = migrationSeed
    ? { ...migrationSeed, profile: migrationSeed.profile ?? profile }
    : renderDefaultConfig(detection, { profile });
  const desiredJson = JSON.stringify(desiredValue, null, 2) + "\n";
  const desiredSha = bytesHashString(desiredJson);
  const kind = existing?.ok && forceOverwrite ? "update" : "create";
  const reason = existing?.ok
    ? "user config overwritten via --force-config"
    : migrationSeed
      ? "synthesising a default config from legacy adapter migration"
      : "synthesising a default config from detection";
  return {
    kind,
    op: "config",
    relPath: ".opencode/ship.config.json",
    target: `${repoRoot}/.opencode/ship.config.json`,
    currentSha: existing?.ok ? existing.sha256 : null,
    desiredSha,
    bytes: Buffer.from(desiredJson, "utf8"),
    configValue: desiredValue,
    reason,
  };
}

export async function planRootConfigApply({ repoRoot, lock, forceRepair }) {
  const detected = findRootConfig(repoRoot);
  const target = detected.path ?? defaultRootConfigPath(repoRoot);
  const previous = lock?.manager?.rootDocuments?.find((d) => d.path === detected.relative);

  const fileMissing = !existsSync(target);
  if (fileMissing && !forceRepair) {
    const seededRecords = (previous?.pointers && previous.pointers.length > 0)
      ? previous.pointers
      : POINTER_ENTRIES.map((entry) => ({
        pointer: entry.pointer,
        strategy: entry.strategy,
        installedSha256: bytesHashString(stableStringify(entry.value)),
        previous: { existed: false },
      }));
    return {
      kind: "noop", op: "root-config", target, relPath: detected.relative,
      reason: "no root opencode.json present",
      edits: [],
      pointerRecords: seededRecords,
    };
  }
  if (fileMissing && forceRepair) {
    const { synthesizeDefaultRootConfig, formatRootConfig } = await import("./root-config.js");
    const doc = synthesizeDefaultRootConfig();
    const bytes = Buffer.from(formatRootConfig(doc), "utf8");
    const newSha = bytesHashString(stableStringify(doc));
    const installedPointers = POINTER_ENTRIES.map((entry) => ({
      pointer: entry.pointer,
      strategy: entry.strategy,
      installedSha256: bytesHashString(stableStringify(entry.value)),
      previous: { existed: false },
    }));
    return {
      kind: "create",
      op: "root-config",
      target,
      relPath: detected.relative,
      bytes,
      desiredSha: newSha,
      currentSha: null,
      edits: installedPointers.map((p) => ({ kind: "create", pointer: p.pointer, value: "(synthesized)" })),
      pointerRecords: installedPointers,
      format: "json",
      document: doc,
      reason: "creating root opencode.json with installer-owned Build permissions",
    };
  }
  const docResult = readRootConfig(target);
  if (!docResult.ok) {
    return {
      kind: "noop", op: "root-config", target, relPath: detected.relative,
      reason: `root config ${docResult.error.kind}`,
      edits: [],
      pointerRecords: previous?.pointers ?? [],
    };
  }
  const previousPointers = previous?.pointers ?? [];
  const result = applyOwnedPointers(docResult.value, { allowEqualValues: true });
  if (result.applied.length === 0 && result.skipped.every((s) => s.reason === "already equal")) {
    const ownedPointers = previousPointers.length > 0
      ? previousPointers
      : POINTER_ENTRIES.map((entry) => {
          const existing = getPointer(docResult.value, entry.pointer);
          return {
            pointer: entry.pointer,
            strategy: entry.strategy,
            installedSha256: bytesHashString(stableStringify(existing ?? entry.value)),
            previous: existing === undefined ? { existed: false } : { existed: true, value: existing },
          };
        });
    return {
      kind: "noop", op: "root-config", target, relPath: detected.relative,
      reason: "no installer-owned entries missing",
      edits: [],
      pointerRecords: ownedPointers,
      format: docResult.format,
      document: docResult.value,
      currentSha: docResult.sha256 ?? null,
      desiredSha: docResult.sha256 ?? null,
    };
  }
  /** @type {Array<{kind: string; pointer: any; reason?: any; existing?: any; desired?: any; value?: any}>} */
  const edits = result.applied.map((a) => ({
    kind: "create", pointer: a.pointer, value: a.value,
  }));
  for (const s of result.skipped) {
    if (s.reason === "already equal") continue;
    edits.push({ kind: "conflict", pointer: s.pointer, reason: s.reason, existing: s.existing, desired: s.desired });
  }
  const { formatRootConfigPreserving, formatRootConfig } = await import("./root-config.js");
  const { parseRootConfigPreservingOrder } = await import("./root-config.js");
  const { setPointer } = await import("./json-pointer.js");
  let bytes;
  let docForWrite = result.doc;
  try {
    const { value: sourceValue, format: sourceFormat } = parseRootConfigPreservingOrder(docResult.raw ?? "");
    docForWrite = sourceValue && typeof sourceValue === "object" ? sourceValue : result.doc;
    for (const entry of result.applied) {
      docForWrite = setPointer(docForWrite, entry.pointer, entry.value);
    }
    bytes = Buffer.from(formatRootConfigPreserving(docForWrite), "utf8");
    void sourceFormat;
  } catch {
    bytes = Buffer.from(formatRootConfig(result.doc), "utf8");
  }
  const newSha = bytesHashString(stableStringify(docForWrite));
  const installedPointers = [...previousPointers];
  for (const e of result.applied) {
    const idx = installedPointers.findIndex((p) => p.pointer === e.pointer);
    const previousEntry = docResult.before?.[e.pointer];
    const next = {
      pointer: e.pointer, strategy: "value",
      installedSha256: bytesHashString(stableStringify(e.value)),
      previous: previousEntry == null
        ? { existed: false }
        : { existed: true, value: previousEntry },
    };
    if (idx >= 0) installedPointers[idx] = next;
    else installedPointers.push(next);
  }
  for (const e of result.skipped) {
    if (e.reason !== "already equal") continue;
    const idx = installedPointers.findIndex((p) => p.pointer === e.pointer);
    if (idx >= 0) continue;
    installedPointers.push({
      pointer: e.pointer, strategy: "value",
      installedSha256: bytesHashString(stableStringify(e.existing ?? null)),
      previous: { existed: true, value: e.existing },
    });
  }
  return {
    kind: edits.some((e) => e.kind === "conflict") ? "conflict" : (edits.length ? "update" : "noop"),
    op: "root-config",
    target,
    relPath: detected.relative,
    bytes,
    desiredSha: newSha,
    currentSha: docResult.sha256 ?? null,
    edits,
    pointerRecords: installedPointers,
    format: docResult.format,
    document: docForWrite,
    reason: edits.length === 0
      ? "no installer-owned entries missing"
      : `apply ${result.applied.length} / skip ${result.skipped.length}`,
  };
}
