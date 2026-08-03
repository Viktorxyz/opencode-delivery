/*
 * opencode-ship profile model.
 *
 * Profiles are mutually exclusive named sets of managed files. The
 * installer ships two profiles:
 *
 *   - core:        the default; ships the canonical plugin, two
 *                  delivery agents, and two delivery skills. Stable
 *                  across every v0.x release.
 *   - engineering: opt-in; extends core with the Matt + Superpowers
 *                  planning and execution skills plus matching
 *                  agents. Installed only when the consumer
 *                  explicitly asks for it.
 *
 * The profile is resolved per-invocation using precedence:
 *   1. explicit CLI flag (--profile <name>)        (caller-provided)
 *   2. ship.config.json `.profile` field           (user-owned)
 *   3. existing lock `.manager.profile` field      (machine record)
 *   4. default (core)
 *
 * An unknown profile always fails the invocation with exit code 2
 * (invalid input). Legacy v0.3 locks without a profile field load
 * as core; the migration happens lazily on next init/update.
 */

export const PROFILES = Object.freeze(["core", "engineering"]);
export const DEFAULT_PROFILE = "core";

export function isValidProfile(name) {
  return typeof name === "string" && PROFILES.includes(name);
}

export function normalizeProfile(name) {
  if (name === undefined || name === null) return DEFAULT_PROFILE;
  if (!isValidProfile(name)) return null;
  return name;
}

/**
 * Resolve the active profile using the documented precedence.
 *
 * Inputs are read-only snapshots. The function does not validate
 * the inputs themselves — callers (cli-args, config loader, lock
 * loader) are responsible for that. An input that survives its
 * own validator is trusted here.
 *
 * @param {object} sources
 * @param {string|null|undefined} [sources.cli]      precedence 1
 * @param {object|null|undefined} [sources.config]    precedence 2
 * @param {object|null|undefined} [sources.lock]      precedence 3
 * @returns {{ profile: string, source: "cli"|"config"|"lock"|"default" }}
 */
export function resolveProfile({ cli = null, config = null, lock = null } = {}) {
  if (cli !== null && cli !== undefined) {
    const v = normalizeProfile(cli);
    if (v === null) {
      throw new Error(`unknown CLI profile '${cli}' (expected one of: ${PROFILES.join(", ")})`);
    }
    return { profile: v, source: "cli" };
  }
  if (config && typeof config === "object" && config.profile !== undefined && config.profile !== null) {
    const v = normalizeProfile(config.profile);
    if (v === null) {
      throw new Error(
        `unknown ship.config.json profile '${config.profile}' (expected one of: ${PROFILES.join(", ")})`,
      );
    }
    return { profile: v, source: "config" };
  }
  if (lock && typeof lock === "object" && lock.manager && lock.manager.profile !== undefined) {
    const v = normalizeProfile(lock.manager.profile);
    if (v === null) {
      throw new Error(
        `unknown lock manager.profile '${lock.manager.profile}' (expected one of: ${PROFILES.join(", ")})`,
      );
    }
    return { profile: v, source: "lock" };
  }
  return { profile: DEFAULT_PROFILE, source: "default" };
}
