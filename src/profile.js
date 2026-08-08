/*
 * opencode-ship profile model.
 *
 * From 1.1.0 onward, the only shipped profile is `engineering`. The
 * `core` profile was removed in the 1.1.0 hard cut because every
 * consumer that today still relies on a `core` installation is
 * either (a) a consumer of a 0.9.x or 1.0.x line that should run
 * `/setup-ship-workflow` and adopt the full lifecycle, or (b) a
 * test fixture that should now use the `engineering` profile and
 * stop verifying the reduced footprint.
 *
 * A consumer whose `ship.config.json` or `ship.lock.json` declares
 * `core` is upgraded to `engineering` on the next `init` or
 * `update`. The CLI refuses `--profile core` with exit 2.
 *
 * The profile is resolved per-invocation using precedence:
 *   1. explicit CLI flag (--profile <name>)        (caller-provided)
 *   2. ship.config.json `.profile` field           (user-owned)
 *   3. existing lock `.manager.profile` field      (machine record)
 *   4. default (engineering)
 *
 * Unknown profiles always fail with exit 2. Legacy v0.3 locks
 * without a profile field load as engineering; the migration
 * happens lazily on next init/update.
 */

export const PROFILES = Object.freeze(["engineering"]);
export const DEFAULT_PROFILE = "engineering";

export function isValidProfile(name) {
  return typeof name === "string" && PROFILES.includes(name);
}

export function normalizeProfile(name) {
  if (name === undefined || name === null) return DEFAULT_PROFILE;
  if (!isValidProfile(name)) return null;
  return name;
}

export function isLegacyCoreProfile(name) {
  return name === "core";
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
      throw new Error(
        `unknown CLI profile '${cli}' (only 'engineering' is supported in 1.1.0; the 'core' profile was removed)`
      );
    }
    return { profile: v, source: "cli" };
  }
  if (config && typeof config === "object" && config.profile !== undefined && config.profile !== null) {
    const v = normalizeProfile(config.profile);
    if (v === null) {
      // Legacy core config: promote to engineering.
      if (isLegacyCoreProfile(config.profile)) {
        return { profile: DEFAULT_PROFILE, source: "default" };
      }
      throw new Error(
        `unknown ship.config.json profile '${config.profile}' (only 'engineering' is supported in 1.1.0)`
      );
    }
    return { profile: v, source: "config" };
  }
  if (lock && typeof lock === "object" && lock.manager && lock.manager.profile !== undefined) {
    const v = normalizeProfile(lock.manager.profile);
    if (v === null) {
      // Legacy core lock: promote to engineering.
      if (isLegacyCoreProfile(lock.manager.profile)) {
        return { profile: DEFAULT_PROFILE, source: "default" };
      }
      throw new Error(
        `unknown lock manager.profile '${lock.manager.profile}' (only 'engineering' is supported in 1.1.0)`
      );
    }
    return { profile: v, source: "lock" };
  }
  return { profile: DEFAULT_PROFILE, source: "default" };
}
