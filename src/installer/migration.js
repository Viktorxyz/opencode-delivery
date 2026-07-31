/*
 * Legacy consumer migration.
 *
 * Detects v0.1.x artifacts and adapts them into a v0.2 installable
 * shape:
 *   1. `.opencode/delivery.json` + `.opencode/delivery.lock.json`
 *      become seeds for the new `ship.config.json` (when missing)
 *      and the new `ship.lock.json` (when no manager version was
 *      previously recorded).
 *   2. A root `opencode.json` plugin entry like
 *      `"https://github.com/Viktorxyz/opencode-delivery#<sha>"`
 *      is removed during migration when the new plugin is being
 *      installed, so we do not double-register.
 *   3. A plugin file `.opencode/plugin/delivery.ts` whose shape
 *      matches the generic nine-tool wrapper is removed when the
 *      bundled `.opencode/plugin/opencode-ship.js` is written.
 *
 * Migration is opt-in (only when the user runs `init`), and
 * destructive actions are gated by the lock: legacy artifacts that
 * have been modified by the user are reported but never deleted.
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readLock } from "./lock.js";
import { loadConfig, writeConfig, renderDefaultConfig } from "./config.js";
import { configPath } from "./config.js";
import { flattenShipConfig } from "./ship-adapter.js";

function legacyAdapterPath(repoRoot) {
  return resolve(repoRoot, ".opencode", "delivery.json");
}

function legacyLockPath(repoRoot) {
  return resolve(repoRoot, ".opencode", "delivery.lock.json");
}

function legacyPluginPath(repoRoot) {
  return resolve(repoRoot, ".opencode", "plugin", "delivery.ts");
}

async function detectLegacyShapes(repoRoot) {
  const out = {
    adapter: false,
    legacyLock: false,
    plugin: false,
    reviewer: false,
    verifier: false,
  };
  if (existsSync(legacyAdapterPath(repoRoot))) out.adapter = true;
  if (existsSync(legacyLockPath(repoRoot))) out.legacyLock = true;
  if (existsSync(legacyPluginPath(repoRoot))) out.plugin = true;
  if (existsSync(resolve(repoRoot, ".opencode/agents/delivery-reviewer.md"))) out.reviewer = true;
  if (existsSync(resolve(repoRoot, ".opencode/agents/delivery-verifier.md"))) out.verifier = true;
  return out;
}

async function readLegacyAdapter(repoRoot) {
  const path = legacyAdapterPath(repoRoot);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    return { path, raw, value: JSON.parse(raw) };
  } catch {
    return null;
  }
}

function isShimPluginEntry(opencodeDoc) {
  const plugin = opencodeDoc?.plugin;
  if (!Array.isArray(plugin)) return null;
  for (const entry of plugin) {
    if (typeof entry === "string" && entry.includes("Viktorxyz/opencode-delivery")) return entry;
  }
  return null;
}

export async function migration({ repoRoot, lock, forceRepair }) {
  const shapes = await detectLegacyShapes(repoRoot);
  const legacy = await readLegacyAdapter(repoRoot);
  const config = await loadConfig(repoRoot);
  const actions = [];

  if (legacy && !config?.ok) {
    await writeConfig(repoRoot, legacyToShipConfig(legacy.value));
    actions.push({ kind: "seeded-config", from: legacy.path });
  }

  if (legacy && shapes.legacyLock && !lock?.manager) {
    actions.push({ kind: "kept-legacy-lock", path: legacyLockPath(repoRoot) });
  }

  if (shapes.plugin && existsSync(resolve(repoRoot, ".opencode/plugin/opencode-ship.js"))) {
    if (!forceRepair) {
      actions.push({ kind: "candidate-remove-legacy-plugin", path: legacyPluginPath(repoRoot) });
    }
  }

  return { shapes, actions, legacyPresent: Boolean(legacy) };
}

export function legacyToShipConfig(legacy) {
  if (!legacy || typeof legacy !== "object") return renderDefaultConfig({});
  return {
    schemaVersion: 1,
    project: {
      remote: legacy.repository?.remote ?? "origin",
      repository: legacy.repository?.defaultBranch?.name
        ?? legacy.repository?.remote
        ?? "owner/repo",
      defaultBranch: legacy.repository?.defaultBranch?.name ?? "main",
      packageManager: "npm",
      detectOverrides: false,
    },
    delivery: {
      worktree: {
        root: legacy.worktree?.root ?? ".worktrees",
        branchTemplate: legacy.worktree?.branchTemplate ?? "{actor}/{slug}",
        bootstrap: Array.isArray(legacy.worktree?.bootstrap) ? legacy.worktree.bootstrap : [["npm", "install"]],
      },
      verification: {
        commands: legacy.verification?.commands?.length
          ? legacy.verification.commands
          : [{ id: "typecheck", argv: ["npm", "run", "typecheck"] }],
        requireCleanDiffAfter: legacy.verification?.requireCleanDiffAfter ?? true,
        invalidateOnHeadChange: legacy.verification?.invalidateOnHeadChange ?? true,
      },
      review: legacy.review ?? { agent: "delivery-reviewer", required: true, invalidateOnHeadChange: true },
      ci: legacy.ci ?? {
        driver: "github-status-checks",
        requiredChecks: ["delivery-verify"],
        wait: true,
        flakyRetry: 1,
      },
      ready: legacy.ready ?? { requires: ["review", "local-verification", "remote-ci"], stopAfterReady: true },
      merge: legacy.merge ?? { strategy: "squash", policy: "explicit-user-request-only", requireFreshGates: true },
      cleanup: legacy.cleanup ?? { when: "next-task", requireUnpublishedGuard: true },
    },
  };
}

export { isShimPluginEntry };
