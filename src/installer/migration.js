/*
 * Legacy consumer migration.
 *
 * Detect the three v0.1.x shapes we ship replacements for:
 *   1. `.opencode/delivery.json` + `.opencode/delivery.lock.json`
 *      (the old source-locked adapter).
 *   2. A root `opencode.json` plugin entry like
 *      `"https://github.com/Viktorxyz/opencode-delivery#<sha>"`.
 *   3. A plugin file `.opencode/plugin/delivery.ts` whose shape
 *      matches Leo's generic 9-tool wrapper.
 *
 * Migration is opt-in: a fresh `init` only observes the legacy
 * shape; the user can refuse to migrate by editing ship.config.json
 * directly. The migration never deletes legacy files; it adopts
 * their canonical content, then leaves them in place so a downgrade
 * remains possible.
 */

import { readFileSync, existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadConfig } from "./config.js";
import { CATALOG } from "./catalog.js";
import { bytesHashString } from "./hash.js";

export async function detectLegacyShape(repoRoot) {
  const shapes = { adapter: false, plugin: false, template: false, agent: false };
  if (existsSync(resolve(repoRoot, ".opencode/delivery.json"))) shapes.adapter = true;
  if (existsSync(resolve(repoRoot, ".opencode/plugin/delivery.ts"))) shapes.plugin = true;
  if (existsSync(resolve(repoRoot, ".opencode/agents/delivery-reviewer.md"))) shapes.agent = true;
  for (const entry of CATALOG) {
    if (existsSync(resolve(repoRoot, entry.path))) shapes.template = true;
  }
  return shapes;
}

export async function adoptLegacyAdapter(repoRoot) {
  const legacyPath = resolve(repoRoot, ".opencode/delivery.json");
  if (!existsSync(legacyPath)) return null;
  try {
    const raw = await readFile(legacyPath, "utf8");
    const parsed = JSON.parse(raw);
    return { path: legacyPath, raw, value: parsed, sha256: bytesHashString(raw) };
  } catch {
    return null;
  }
}

export async function adoptLegacyPlugin(repoRoot) {
  const path = resolve(repoRoot, ".opencode/plugin/delivery.ts");
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    return { path, raw, sha256: bytesHashString(raw) };
  } catch {
    return null;
  }
}

export async function adoptLegacyAgents(repoRoot) {
  const out = {};
  for (const name of ["delivery-reviewer", "delivery-verifier"]) {
    const path = resolve(repoRoot, ".opencode/agents", `${name}.md`);
    if (!existsSync(path)) continue;
    out[name] = await readFile(path, "utf8");
  }
  return out;
}

export function isShimPluginEntry(opencodeDoc) {
  const plugin = opencodeDoc?.plugin;
  if (!Array.isArray(plugin)) return null;
  for (const entry of plugin) {
    if (typeof entry === "string" && entry.includes("Viktorxyz/opencode-delivery")) return entry;
  }
  return null;
}

void writeFile;
