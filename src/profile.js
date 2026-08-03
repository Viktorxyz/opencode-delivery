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
 *   1. explicit CLI flag (--profile <name>)
 *   2. ship.config.json `.profile` field
 *   3. existing lock `.manager.profile` field
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
