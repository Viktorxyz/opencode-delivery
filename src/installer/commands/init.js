/*
 * opencode-ship command: init.
 *
 * Detect project, plan, commit. Returns 0 on success, 3 on conflict,
 * 4 on transaction failure, 2 on invalid project.
 */

import { previewInstall, commitInstall } from "../executor.js";

export async function runInit(options) {
  const preview = await previewInstall({
    rootPath: options.rootPath ?? null,
    replaceManaged: false,
    forceConfig: Boolean(options.forceConfig),
    forceRootConfig: Boolean(options.forceRootConfig),
  });
  if (!preview.ok) {
    return emitFailure(2, preview.error?.kind ?? "invalid-project", options.json, "init");
  }
  return commitInstall(preview, { json: options.json, command: "init" });
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
