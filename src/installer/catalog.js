/*
 * opencode-ship asset catalog.
 *
 * The catalog is the single source of truth for every managed file
 * the installer can install, upgrade, downgrade, or remove. Each
 * entry fixes:
 *
 *   - id           a stable string used in lock metadata and tests
 *   - kind         plugin | agent | skill | support
 *   - path         the on-disk target inside the consumer repo
 *   - source       the absolute source path inside this package
 *   - mode         the unix permission enforced on install
 *   - profile      the profile(s) that include this entry; absent
 *                  means the entry is part of every profile
 *
 * The catalog is immutable at runtime; `validateCatalog` confirms
 * every source exists, every path is `.opencode/-rooted`, and every
 * id is unique so the planner/executor/doctor layers can trust the
 * table without further validation. The catalog validator runs in
 * `init`, `diff`, and `update` and refuses to proceed when a source
 * is missing instead of silently producing an empty file.
 *
 * Profile filtering:
 *   - `core`      ships the bundled plugin, the two delivery agents,
 *                 and the two delivery skills.
 *   - `practices` adds the practice subagents and the four
 *                 methodology skills, including the vendored
 *                 Superpowers content.
 *   - The default profile is `core`. `init --profile practices`
 *                 installs the full bundle; runtime switches are
 *                 detected by the lock and gate the next `update`.
 */

import { resolve, relative, sep } from "node:path";
import { existsSync, statSync } from "node:fs";
import { resolvePackageRoot } from "./package-root.js";
import { PACKAGE_VERSION, TEMPLATE_SET } from "../version.js";

export { PACKAGE_VERSION };
export const TEMPLATE_SET_ID = TEMPLATE_SET;

export const PROFILES = ["core", "practices"];

const packageRoot = resolvePackageRoot(import.meta.url);

export const CATALOG = [
  {
    id: "plugin:opencode-ship",
    kind: "plugin",
    path: ".opencode/plugins/opencode-ship.js",
    source: resolve(packageRoot, "dist/plugin.js"),
    mode: 0o644,
  },
  {
    id: "agent:delivery-reviewer",
    kind: "agent",
    path: ".opencode/agents/delivery-reviewer.md",
    source: resolve(packageRoot, "assets/agents/delivery-reviewer.md"),
    mode: 0o644,
  },
  {
    id: "agent:delivery-verifier",
    kind: "agent",
    path: ".opencode/agents/delivery-verifier.md",
    source: resolve(packageRoot, "assets/agents/delivery-verifier.md"),
    mode: 0o644,
  },
  {
    id: "skill:delivery-workflow",
    kind: "skill",
    path: ".opencode/skills/delivery-workflow/SKILL.md",
    source: resolve(packageRoot, "assets/skills/delivery-workflow/SKILL.md"),
    mode: 0o644,
  },
  {
    id: "skill:planning-research-checkpoint",
    kind: "skill",
    path: ".opencode/skills/planning-research-checkpoint/SKILL.md",
    source: resolve(packageRoot, "assets/skills/planning-research-checkpoint/SKILL.md"),
    mode: 0o644,
  },
  {
    id: "agent:practice-implementer",
    kind: "agent",
    path: ".opencode/agents/practice-implementer.md",
    source: resolve(packageRoot, "assets/agents/practice-implementer.md"),
    mode: 0o644,
    profile: "practices",
  },
  {
    id: "agent:practice-spec-reviewer",
    kind: "agent",
    path: ".opencode/agents/practice-spec-reviewer.md",
    source: resolve(packageRoot, "assets/agents/practice-spec-reviewer.md"),
    mode: 0o644,
    profile: "practices",
  },
  {
    id: "agent:practice-quality-reviewer",
    kind: "agent",
    path: ".opencode/agents/practice-quality-reviewer.md",
    source: resolve(packageRoot, "assets/agents/practice-quality-reviewer.md"),
    mode: 0o644,
    profile: "practices",
  },
  {
    id: "skill:test-driven-development",
    kind: "skill",
    path: ".opencode/skills/test-driven-development/SKILL.md",
    source: resolve(packageRoot, "assets/skills/test-driven-development/SKILL.md"),
    mode: 0o644,
    profile: "practices",
  },
  {
    id: "skill:systematic-debugging",
    kind: "skill",
    path: ".opencode/skills/systematic-debugging/SKILL.md",
    source: resolve(packageRoot, "assets/skills/systematic-debugging/SKILL.md"),
    mode: 0o644,
    profile: "practices",
  },
  {
    id: "skill:subagent-driven-development",
    kind: "skill",
    path: ".opencode/skills/subagent-driven-development/SKILL.md",
    source: resolve(packageRoot, "assets/skills/subagent-driven-development/SKILL.md"),
    mode: 0o644,
    profile: "practices",
  },
  {
    id: "skill:model-selection",
    kind: "skill",
    path: ".opencode/skills/model-selection/SKILL.md",
    source: resolve(packageRoot, "assets/skills/model-selection/SKILL.md"),
    mode: 0o644,
    profile: "practices",
  },
];

const ALLOWED_KINDS = new Set(["plugin", "agent", "skill", "support"]);

export function pluginPath() {
  return CATALOG.find((entry) => entry.kind === "plugin")?.path ?? ".opencode/plugins/opencode-ship.js";
}

export function normalizeProfile(profile) {
  if (!profile || typeof profile !== "string") return "core";
  return PROFILES.includes(profile) ? profile : "core";
}

export function catalogForProfile(profile, { catalog = CATALOG } = {}) {
  const active = normalizeProfile(profile);
  return catalog.filter((entry) => {
    if (!entry.profile) return true;
    if (Array.isArray(entry.profile)) return entry.profile.includes(active);
    return entry.profile === active;
  });
}

/**
 * Fail-closed catalog validation. Throws when any entry is malformed
 * or when any source file does not exist on disk. The caller decides
 * whether to surface this as the installer's exit code 4 (installer
 * surface) or as a packaging failure (prepack).
 */
export function validateCatalog({ catalog = CATALOG } = {}) {
  const seenIds = new Set();
  const seenPaths = new Set();
  const issues = [];

  for (const entry of catalog) {
    if (!entry || typeof entry !== "object") {
      issues.push({ id: null, kind: "shape", message: "catalog entry is not an object" });
      continue;
    }
    const { id, kind, path, source, mode, profile } = entry;

    if (typeof id !== "string" || id.length === 0) {
      issues.push({ id: null, kind: "id", message: `entry id missing: ${JSON.stringify(entry)}` });
    } else if (seenIds.has(id)) {
      issues.push({ id, kind: "duplicate-id", message: `duplicate catalog id: ${id}` });
    } else {
      seenIds.add(id);
    }

    if (typeof path !== "string" || !path.startsWith(".opencode" + sep)) {
      issues.push({ id, kind: "path", message: `path must be rooted under .opencode/: ${path}` });
    }
    if (seenPaths.has(path)) {
      issues.push({ id, kind: "duplicate-path", message: `duplicate target path: ${path}` });
    } else {
      seenPaths.add(path);
    }

    if (!ALLOWED_KINDS.has(kind)) {
      issues.push({ id, kind: "kind", message: `unsupported entry kind: ${kind}` });
    }

    if (profile !== undefined) {
      const valid = Array.isArray(profile)
        ? profile.every((p) => PROFILES.includes(p))
        : PROFILES.includes(profile);
      if (!valid) {
        issues.push({ id, kind: "profile", message: `unsupported profile membership: ${JSON.stringify(profile)}` });
      }
    }

    if (typeof source !== "string" || source.length === 0) {
      issues.push({ id, kind: "source", message: `source path missing: ${id}` });
    } else if (!existsSync(source)) {
      issues.push({ id, kind: "source-missing", message: `source file not found: ${source}` });
    } else {
      try {
        const stats = statSync(source);
        if (!stats.isFile()) {
          issues.push({ id, kind: "source-not-file", message: `source is not a regular file: ${source}` });
        } else if (stats.size === 0) {
          issues.push({ id, kind: "source-empty", message: `source file is empty: ${source}` });
        }
      } catch (e) {
        issues.push({ id, kind: "source-stat", message: `unable to stat source: ${e?.message ?? e}` });
      }
      const rel = relative(packageRoot, source);
      if (rel.startsWith("..")) {
        issues.push({ id, kind: "source-out-of-package", message: `source escapes package root: ${source}` });
      }
    }

    if (mode !== 0o644) {
      issues.push({ id, kind: "mode", message: `mode must be 0o644: ${id}` });
    }
  }

  if (issues.length > 0) {
    const summary = issues.map((i) => i.message).join("; ");
    const err = new Error(`opencode-ship catalog validation failed: ${summary}`);
    /** @type {any} */ (err).issues = issues;
    /** @type {any} */ (err).catalogValidation = true;
    throw err;
  }
  return catalog;
}

// Validate from the installer's dispatch boundary. The CLI commands
// (`init`, `diff`, `update`) and `prepack` invoke `validateCatalog()`
// before any filesystem change so a broken package state surfaces as
// the installer's exit code 4 rather than as an empty managed file.
