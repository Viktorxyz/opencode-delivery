/*
 * Engineering workflow configuration: model roles + plan policy.
 *
 * The installer ships an optional engineering profile that
 * configures the GPT-to-MiniMax handoff:
 *
 *   models.planner         GPT model that writes per-ticket plans
 *   models.builder         MiniMax model that implements tasks
 *   models.finalReviewer   GPT model that does final Standards +
 *                          Spec review
 *
 *   plans.root             Git common directory for plans/
 *   plans.mirrorToIssue    whether to POST approved plans as
 *                          marked issue comments (currently mandatory)
 *
 * resolveModelRoles is the runtime's view: it merges the user's
 * config with documented defaults so a single source of truth
 * (here) controls what OpenCode launches.
 */

import { PROFILES, isValidProfile } from "../profile.js";

const MODEL_ID_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

const DEFAULTS = Object.freeze({
  planner: "openai/gpt-5.6-sol",
  builder: "minimax/MiniMax-M3",
  finalReviewer: "openai/gpt-5.6-sol",
});

/**
 * Fail-closed config validator. Returns `{ ok, kind, issues }`
 * for callers that want to surface diagnostics. Missing
 * engineering config is treated as "engineering profile
 * disabled" and returns ok.
 */
export function validateEngineeringConfig(cfg) {
  if (cfg === undefined || cfg === null) return { ok: true, kind: "empty", issues: [] };
  if (typeof cfg !== "object" || Array.isArray(cfg)) {
    return { ok: false, kind: "shape", issues: ["engineering config root must be an object"] };
  }
  const issues = [];
  let kind = "ok";
  if (cfg.models) {
    if (typeof cfg.models !== "object" || Array.isArray(cfg.models)) {
      issues.push("models must be an object");
      kind = "shape";
    } else {
      for (const [role, id] of Object.entries(cfg.models)) {
        if (typeof id !== "string" || !MODEL_ID_RE.test(id)) {
          issues.push(`models.${role} is not a valid "<provider>/<model>" id: ${JSON.stringify(id)}`);
          kind = "shape";
        }
      }
    }
  }
  if (cfg.plans !== undefined) {
    if (typeof cfg.plans !== "object" || Array.isArray(cfg.plans)) {
      issues.push("plans must be an object");
      kind = "shape";
    } else {
      if (cfg.plans.root !== undefined) {
        if (typeof cfg.plans.root !== "string" || !cfg.plans.root.startsWith(".git/opencode-ship/")) {
          issues.push(`plans.root must be rooted under .git/opencode-ship/: ${cfg.plans.root}`);
          kind = "shape";
        }
      }
      if (cfg.plans.mirrorToIssue === false) {
        issues.push("plans.mirrorToIssue=false is not currently supported");
        kind = "shape";
      }
    }
  }
  return { ok: issues.length === 0, kind, issues };
}

/**
 * Merge the user config with the documented defaults. When
 * `strict` is true, an explicitly-empty role (user provided ""
 * for a role that has no default) throws; otherwise the default
 * fills the gap silently.
 */
export function resolveModelRoles(cfg, { strict = false } = {}) {
  const out = { ...DEFAULTS };
  if (cfg && cfg.models) {
    for (const [role, id] of Object.entries(cfg.models)) {
      if (id && typeof id === "string" && id.length > 0) {
        out[role] = id;
      } else if (strict && Object.prototype.hasOwnProperty.call(cfg.models, role)) {
        throw new Error(`resolveModelRoles: user provided empty model id for '${role}'`);
      }
    }
  }
  if (strict) {
    for (const role of ["planner", "builder", "finalReviewer"]) {
      if (!out[role]) {
        throw new Error(`resolveModelRoles: required role '${role}' missing and no default available`);
      }
    }
  }
  return out;
}

// Marker so the linter does not flag the import above as unused
// when callers reach resolveModelRoles via tree-shaking.
void isValidProfile;
void PROFILES;
