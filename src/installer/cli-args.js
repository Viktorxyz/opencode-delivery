/*
 * Argument parsing for opencode-ship.
 *
 * Minimal, dependency-free parser with strict subcommand dispatch and
 * stable `--json` / `--root` / `--config` flags.
 */

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
  --root <path>          Project root (defaults to cwd).
  --config <path>        Override the config file location (init only).
  --force-config         Rewrite the user config from detection (init only).
  --replace-managed      Replace locally-modified managed files (update only).
  --purge-config         Remove ship.config.json when uninstalling.
  --json                 Emit a JSON envelope instead of human output.
`;

function parseFlags(argv) {
  const options = {
    rootPath: null,
    configPath: null,
    json: false,
    replaceManaged: false,
    purgeConfig: false,
    forceConfig: false,
    forceRootConfig: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--replace-managed") options.replaceManaged = true;
    else if (arg === "--purge-config") options.purgeConfig = true;
    else if (arg === "--force-config") options.forceConfig = true;
    else if (arg === "--force-root-config") options.forceRootConfig = true;
    else if (arg === "--root") options.rootPath = argv[++i];
    else if (arg === "--config") options.configPath = argv[++i];
    else if (arg === "-h" || arg === "--help") return { help: true };
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
