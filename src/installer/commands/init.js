/*
 * opencode-ship command: init.
 *
 * Detect project, plan, commit, then auto-run doctor.
 * Returns 0 on success, 1 with --strict-doctor on unhealthy
 * doctor, 3 on conflict, 4 on transaction failure, 2 on
 * invalid project.
 */

import { previewInstall, commitInstall, serializePlan } from "../executor.js";
import { runDoctor } from "./doctor.js";
import { validateCatalog } from "../catalog.js";

export async function runInit(options) {
  try {
    validateCatalog();
  } catch (e) {
    if (e?.catalogValidation) {
      return emitFailure(4, `catalog validation failed: ${e.message}`, options.json, "init");
    }
    throw e;
  }
  const preview = await previewInstall({
    rootPath: options.rootPath ?? null,
    profile: options.profile ?? null,
    replaceManaged: false,
    forceConfig: Boolean(options.forceConfig),
    forceRootConfig: Boolean(options.forceRootConfig),
    models: options.models ?? null,
  });
  if (!preview.ok) {
    if (preview.error?.kind === "unsupported-lock-schema") {
      return emitFailure(5, `unsupported lock schema: ${(preview.error.issues ?? []).join("; ")}`, options.json, "init");
    }
    if (preview.error?.kind === "engineering-models-required") {
      return emitFailure(2, preview.error.message, options.json, "init");
    }
    if (preview.error?.kind === "engineering-approval-required") {
      return emitFailure(2, preview.error.message, options.json, "init");
    }
    if (preview.error?.kind === "lock-invalid") {
      return emitFailure(3, `lock invalid: ${(preview.error.issues ?? []).join("; ")}`, options.json, "init");
    }
    return emitFailure(2, preview.error?.kind ?? "invalid-project", options.json, "init");
  }
  const committed = await commitInstall(preview, { json: options.json, command: "init" });
  let exitCode = committed.extra?.exitCode ?? 0;
  if (!committed || exitCode !== 0) {
    if (exitCode === 2) return emitFailure(2, committed?.diagnostics?.[0] ?? "invalid project", options.json, "init");
    if (exitCode === 3) return emitFailure(3, committed?.diagnostics?.[0] ?? "conflict", options.json, "init");
    if (exitCode === 4) return emitFailure(4, committed?.diagnostics?.[0] ?? "transaction failure", options.json, "init");
    return emitFailure(exitCode, committed?.diagnostics?.[0] ?? "unknown", options.json, "init");
  }

  const doctor = await runDoctor({
    rootPath: options.rootPath ?? null,
    profile: options.profile ?? null,
    json: Boolean(options.json),
    writeOutput: false,
  });
  /** @type {any} */ committed.extra = { ...(committed.extra ?? {}), doctor: { issues: doctor.issues, checks: doctor.checks, exitCode: doctor.exitCode } };
  committed.diagnostics = [...(committed.diagnostics ?? []), ...(doctor.issues ?? [])];

  if (doctor.issues && doctor.issues.length > 0) {
    committed.diagnostics = [`doctor: ${doctor.issues.length} check(s) unhealthy`, ...committed.diagnostics];
    if (options.strictDoctor) {
      exitCode = 1;
    }
  }

  if (options.json) {
    const envelope = {
      reportVersion: 1,
      command: "init",
      status: exitCode === 0 ? "ok" : "warning",
      plan: serializePlan(committed.plan ?? []),
      conflicts: committed.conflicts ?? [],
      summary: committed.summary ?? {},
      diagnostics: committed.diagnostics ?? [],
      doctor: doctor.issues ?? [],
      doctorChecks: doctor.checks ?? [],
      exitCode,
    };
    Object.assign(envelope, committed.extra ?? {}, { doctor: doctor.issues ?? [] });
    process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
  } else if (exitCode !== 0) {
    process.stdout.write(`opencode-ship: doctor reported ${doctor.issues.length} unhealthy check(s)\n`);
  } else {
    process.stdout.write(`opencode-ship: installed; doctor OK\n`);
  }

  process.exitCode = exitCode;
  return { ok: exitCode === 0, exitCode };
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
