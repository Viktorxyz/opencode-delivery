/*
 * Root opencode.json / opencode.jsonc editing.
 *
 * The installer owns ONLY the Build-agent delivery permissions and
 * the reviewer/verifier subagent delegation allow-rules. Nothing
 * else is touched. The root config remains a shared document; we
 * never replace the whole file, we never invent one without
 * explicit user direction, and we never silently overwrite a leaf
 * that already carries a different value.
 *
 * JSONC support is intentionally narrow: we accept comments
 * (`//` and `/* *\/` style) and trailing commas, but we never emit
 * either format by default. Comments and trailing commas in the
 * source file are preserved only by writing through `jsonc-parser`
 * when we touch the file; for the initial install we only
 * synthesise JSON when we are the ones creating the file (which we
 * never do; `init` only writes the user config and root config
 * pointers).
 */

import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setPointer, getPointer, stableStringify } from "./json-pointer.js";
import { bytesHashString } from "./hash.js";
import { POINTER_ENTRIES } from "./catalog.js";

const ROOT_PATH_CANDIDATES = ["opencode.json", "opencode.jsonc"];

export function findRootConfig(repoRoot) {
  for (const rel of ROOT_PATH_CANDIDATES) {
    const abs = resolve(repoRoot, rel);
    if (existsSync(abs)) return { path: abs, relative: rel, format: rel.endsWith(".jsonc") ? "jsonc" : "json" };
  }
  return { path: null, relative: ROOT_PATH_CANDIDATES[0], format: "json" };
}

export function defaultRootConfigPath(repoRoot) {
  return resolve(repoRoot, ROOT_PATH_CANDIDATES[0]);
}

export function readRootConfig(absPath) {
  if (!existsSync(absPath)) {
    return { ok: false, error: { kind: "missing", path: absPath } };
  }
  const raw = readFileSync(absPath, "utf8");
  const stripped = stripJsonc(raw);
  try {
    const value = JSON.parse(stripped);
    return {
      ok: true,
      path: absPath,
      raw,
      sha256: bytesHashString(raw),
      value,
      before: snapshotValues(value),
      format: absPath.endsWith(".jsonc") ? "jsonc" : "json",
    };
  } catch (e) {
    return { ok: false, error: { kind: "parse", path: absPath, message: e.message } };
  }
}

function snapshotValues(doc) {
  const out = {};
  for (const entry of POINTER_ENTRIES) {
    out[entry.pointer] = getPointer(doc, entry.pointer);
  }
  return out;
}

function stripJsonc(text) {
  let stripped = "";
  let i = 0;
  let inString = false;
  let escape = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      stripped += ch;
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      stripped += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    stripped += ch;
    i += 1;
  }
  return stripped.replace(/,\s*([}\]])/g, "$1");
}

export function applyOwnedPointers(rootDoc, { pointerEntries = POINTER_ENTRIES, allowEqualValues = true } = {}) {
  const result = { doc: rootDoc, applied: [], skipped: [] };
  let doc = rootDoc;
  for (const entry of pointerEntries) {
    const existing = getPointer(doc, entry.pointer);
    if (existing === undefined) {
      doc = setPointer(doc, entry.pointer, entry.value);
      result.applied.push({ pointer: entry.pointer, value: entry.value });
      continue;
    }
    if (existing === entry.value) {
      if (allowEqualValues) {
        result.skipped.push({ pointer: entry.pointer, reason: "already equal" });
      }
      continue;
    }
    result.skipped.push({
      pointer: entry.pointer, reason: "different existing value",
      existing, desired: entry.value,
    });
  }
  return result;
}
