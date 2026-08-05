/*
 * Argument parsing for opencode-ship.
 *
 * Minimal, dependency-free parser with strict subcommand dispatch and
 * stable `--json` / `--root` / `--config` flags.
 */

import { PROFILES, isValidProfile } from "../profile.js";

const USAGE = `opencode-ship <command> [options]

Commands:
  init        Install or update managed files in this project.
  diff        Show what would change without writing.
  update      Apply pending updates after recovering the journal.
  doctor      Validate environment, lock, and references.
  uninstall   Remove managed files that still match the lock.
  --version   Print the version and exit.
  --help      Show this usage and exit.

Options:
  --root <path>               Project root (defaults to cwd).
  --profile <name>            Override active profile: ${PROFILES.join(", ")}.
  --force-config              Rewrite the user config from detection (init only).
  --force-root-config         Create opencode.json when absent (init only).
  --strict-doctor             Fail init when doctor reports unhealthy checks.
  --replace-managed           Replace locally-modified managed files (update only).
  --purge-config              Remove ship.config.json when uninstalling.
  --planner-model <id>        Engineering model id for the strong planner.
  --builder-model <id>        Engineering model id for the cheap builder.
  --final-reviewer-model <id> Engineering model id for the Standards + Spec reviewer.
  --json                      Emit a JSON envelope instead of human output.
`;

const MODEL_ID_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

export function parseFlags(argv) {
  const options = {
    rootPath: null,
    profile: null,
    json: false,
    replaceManaged: false,
    purgeConfig: false,
    forceConfig: false,
    forceRootConfig: false,
    strictDoctor: false,
    plannerModel: null,
    builderModel: null,
    finalReviewerModel: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--replace-managed") options.replaceManaged = true;
    else if (arg === "--purge-config") options.purgeConfig = true;
    else if (arg === "--force-config") options.forceConfig = true;
    else if (arg === "--force-root-config") options.forceRootConfig = true;
    else if (arg === "--strict-doctor") options.strictDoctor = true;
    else if (arg === "--root") options.rootPath = argv[++i];
    else if (arg === "--profile") {
      const value = argv[++i];
      if (value === undefined) {
        return { error: "--profile requires a value" };
      }
      if (!isValidProfile(value)) {
        return { error: `unknown profile '${value}' (expected one of: ${PROFILES.join(", ")})` };
      }
      options.profile = value;
    } else if (arg === "--planner-model" || arg === "--builder-model" || arg === "--final-reviewer-model") {
      const value = argv[++i];
      if (value === undefined) return { error: `${arg} requires a value` };
      if (!MODEL_ID_RE.test(value)) {
        return { error: `${arg} must be a "<provider>/<model>" id, got ${JSON.stringify(value)}` };
      }
      if (arg === "--planner-model") options.plannerModel = value;
      else if (arg === "--builder-model") options.builderModel = value;
      else options.finalReviewerModel = value;
    } else if (arg === "-h" || arg === "--help") return { help: true };
    else if (arg === "-v" || arg === "--version") return { version: true };
    else return { error: `unknown flag ${arg}` };
  }
  return options;
}

export function parseCommand(argv) {
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return { command: "help" };
    if (arg === "--version" || arg === "-v") return { command: "version" };
  }
  const [cmd, ...rest] = argv;
  if (!cmd) return { command: "help" };
  const flags = parseFlags(rest);
  if ("help" in flags) return { command: "help" };
  if ("version" in flags) return { command: "version" };
  if ("error" in flags) return { error: flags.error };
  switch (cmd) {
    case "init":
    case "diff":
    case "update":
    case "doctor":
    case "uninstall":
      return { command: cmd, options: flags };
    default:
      return { error: `unknown command ${cmd}` };
  }
}

export function helpText() {
  return USAGE;
}
