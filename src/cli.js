/*
 * opencode-ship CLI entry point.
 *
 * Parses argv with the dependency-free parser, dispatches to the
 * command modules, and emits a stable exit code. We never use
 * `process.exit` until the command has finished writing its human or
 * JSON envelope so wrapper scripts can capture the output.
 */

import { parseCommand, helpText } from "./installer/cli-args.js";
import { runInit } from "./installer/commands/init.js";
import { runDiff } from "./installer/commands/diff.js";
import { runUpdate } from "./installer/commands/update.js";
import { runUninstall } from "./installer/commands/uninstall.js";
import { runDoctor } from "./installer/commands/doctor.js";

const VERSION = process.env.OPENCODE_SHIP_VERSION ?? "0.2.0";

async function main() {
  const parsed = parseCommand(process.argv.slice(2));
  if (parsed.command === "help") {
    process.stdout.write(helpText() + "\n");
    process.exit(0);
    return;
  }
  if (parsed.command === "version") {
    process.stdout.write(`opencode-ship ${VERSION}\n`);
    process.exit(0);
    return;
  }
  if ("error" in parsed) {
    process.stdout.write(`opencode-ship: ${parsed.error}\n\n${helpText()}`);
    process.exit(2);
    return;
  }
  switch (parsed.command) {
    case "init":
      await runInit(parsed.options);
      return;
    case "diff":
      await runDiff(parsed.options);
      return;
    case "update":
      await runUpdate(parsed.options);
      return;
    case "doctor":
      await runDoctor(parsed.options);
      return;
    case "uninstall":
      await runUninstall(parsed.options);
      return;
    default:
      process.stdout.write(helpText() + "\n");
      process.exit(2);
  }
}

main().catch((e) => {
  process.stderr.write(`opencode-ship: internal failure: ${e?.message ?? String(e)}\n`);
  if (e?.stack) process.stderr.write(e.stack + "\n");
  process.exit(4);
});
