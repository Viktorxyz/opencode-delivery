/*
 * opencode-ship command: uninstall.
 *
 * Removes managed files whose bytes still match the lock,
 * restores the consumer's root opencode.json to its preinstall
 * state using the previously recorded `previous` values, and
 * unlinks the lock itself. All file operations, the root-config
 * restoration, and the lock deletion are part of a single
 * transactional plan so a crash mid-uninstall leaves a
 * recoverable journal.
 *
 * user-owned `ship.config.json` is preserved unless
 * `--purge-config` is supplied. Exit 3 on conflict.
 */

import { executePlan } from "../transaction.js";
import { unlink } from "node:fs/promises";
import { configPath } from "../config.js";
import { previewUninstall } from "../executor.js";

export async function runUninstall(options) {
  const preview = await previewUninstall({ rootPath: options.rootPath });
  if (!preview.ok) {
    if (preview.error?.kind === "unsupported-lock-schema") {
      return emitFailure(5, `unsupported lock schema: ${(preview.error.issues ?? []).join("; ")}`, options.json);
    }
    if (preview.error?.kind === "lock-invalid") {
      return emitFailure(3, `lock invalid: ${(preview.error.issues ?? []).join("; ")}`, options.json);
    }
    return emitFailure(2, preview.error?.kind ?? "invalid-project", options.json);
  }
  const { repoRoot, plan, conflicts, summary } = preview;
  if (conflicts.length > 0) {
    return emitReport(plan, conflicts, summary, options.json, 3, ["modified managed files; refusing to delete"]);
  }
  const tx = await executePlan({ repoRoot, plan, newLockBuilder: null });
  if (!tx.ok) {
    return emitFailure(4, tx.error?.message ?? "transaction failure", options.json);
  }
  if (options.purgeConfig) {
    await unlink(configPath(repoRoot)).catch(() => null);
  }
  return emitReport(plan, [], summary, options.json, 0, [tx.recovered ? "journal recovered before uninstall" : ""].filter(Boolean));
}

function emitFailure(code, message, json) {
  if (json) {
    process.stdout.write(JSON.stringify({
      reportVersion: 1, command: "uninstall", status: "error",
      plan: [], conflicts: [], summary: { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0 },
      diagnostics: [message], exitCode: code,
    }, null, 2) + "\n");
  } else {
    process.stdout.write(`opencode-ship: ${message}\n`);
  }
  process.exitCode = code;
  return { ok: false, exitCode: code };
}

function emitReport(plan, conflicts, summary, json, exitCode, diagnostics) {
  const safePlan = plan.map((op) => {
    const { bytes, ...rest } = op ?? {};
    return bytes && Buffer.isBuffer(bytes) ? { ...rest, bytesLength: bytes.length } : rest;
  });
  if (json) {
    process.stdout.write(JSON.stringify({
      reportVersion: 1, command: "uninstall",
      status: conflicts.length > 0 ? "conflict" : exitCode === 0 ? "ok" : "error",
      plan: safePlan, conflicts, summary, diagnostics, exitCode,
    }, null, 2) + "\n");
  } else {
    const head = "# opencode-ship uninstall";
    const lines = [head, "", "## Plan"];
    for (const op of plan) lines.push(`  - ${op.kind.padEnd(9)} ${op.relPath ?? op.target}${op.reason ? ` — ${op.reason}` : ""}`);
    if (conflicts.length) {
      lines.push("", `## Conflicts (${conflicts.length})`);
      for (const c of conflicts) lines.push(`  - ${c.relPath ?? c.target}: ${c.reason}`);
    }
    lines.push("", `Summary: ${JSON.stringify(summary)}`);
    process.stdout.write(lines.join("\n") + "\n");
  }
  process.exitCode = exitCode;
  return { ok: true, exitCode };
}
