/*
 * opencode-ship command: update.
 *
 * Behaves like `init` but fails (exit 3) on conflict unless
 * `--replace-managed` is supplied. Writes the new lock if the
 * transaction commits.
 */

import { previewInstall, commitInstall } from "../executor.js";

export async function runUpdate(options) {
  const preview = await previewInstall({
    rootPath: options.rootPath,
    replaceManaged: options.replaceManaged,
    forceConfig: options.forceConfig,
    forceRootConfig: options.forceRootConfig,
  });
  if (!preview.ok) {
    return emitFailure(2, preview.error?.kind ?? "invalid-project", options.json, "update");
  }
  if (preview.conflicts.length > 0 && !options.replaceManaged) {
    return emitFailure(3, "modified managed files; rerun with --replace-managed", options.json, "update");
  }
  return commitInstall(preview, { json: options.json, command: "update" });
}

function emitFailure(code, message, json, command) {
  if (json) {
    process.stdout.write(JSON.stringify({
      reportVersion: 1, command, status: "error",
      plan: [], conflicts: [], summary: { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0 },
      diagnostics: [message], exitCode: code,
    }, null, 2) + "\n");
  } else {
    process.stdout.write(`opencode-ship: ${message}\n`);
  }
  process.exitCode = code;
  return { ok: false, exitCode: code };
}
