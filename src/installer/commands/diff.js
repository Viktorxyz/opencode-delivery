/*
 * opencode-ship command: diff.
 *
 * Read-only. Reports the same plan `init` would commit, with no
 * filesystem mutation. Exit 0 = no changes, exit 1 = changes.
 */

import { previewInstall } from "../executor.js";

function summarise(plan) {
  const counts = { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0, lock: 0, config: 0, rootConfig: 0 };
  for (const op of plan) {
    if (!op) continue;
    if (op.op === "lock") counts.lock += 1;
    else if (op.op === "config") counts.config += 1;
    else if (op.op === "root-config") counts.rootConfig += 1;
    else if (counts[op.kind] !== undefined) counts[op.kind] += 1;
  }
  return counts;
}

function serializePlan(plan) {
  return plan.filter(Boolean).map((op) => {
    if (!op) return null;
    const { bytes, ...rest } = op;
    if (bytes && Buffer.isBuffer(bytes)) {
      return { ...rest, bytesLength: bytes.length };
    }
    return rest;
  });
}

export async function runDiff(options) {
  const preview = await previewInstall({
    rootPath: options.rootPath ?? null,
    replaceManaged: false,
    forceConfig: false,
    forceRootConfig: false,
  });
  if (!preview.ok) {
    if (options.json) {
      process.stdout.write(JSON.stringify({
        reportVersion: 1, command: "diff", status: "error",
        plan: [], conflicts: [], summary: { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0 },
        diagnostics: [preview.error?.kind ?? "invalid-project"],
        exitCode: 2,
      }, null, 2) + "\n");
    } else {
      process.stdout.write(`opencode-ship: ${preview.error?.kind ?? "invalid-project"}\n`);
    }
    process.exitCode = 2;
    return { ok: false, exitCode: 2 };
  }
  const { plan, conflicts, migrationReport } = preview;
  const summary = summarise(plan);
  const changes = summary.create + summary.update + summary.delete + summary.conflict;
  if (options.json) {
    process.stdout.write(JSON.stringify({
      reportVersion: 1, command: "diff",
      status: conflicts.length > 0 ? "conflict" : changes ? "changed" : "noop",
      plan: serializePlan(plan), conflicts, summary,
      diagnostics: [],
      migrationReport,
      exitCode: changes ? 1 : 0,
    }, null, 2) + "\n");
  } else {
    const head = "# opencode-ship diff";
    const lines = [head, "", "## Plan"];
    for (const op of plan.filter(Boolean)) {
      const bytesHint = op.bytes ? `${(op.bytes.length ?? 0)}b` : "";
      lines.push(`  - ${op.kind.padEnd(9)} ${op.op} ${op.relPath ?? op.target}${bytesHint ? ` (${bytesHint})` : ""}${op.reason ? ` — ${op.reason}` : ""}`);
    }
    if (conflicts.length) {
      lines.push("", `## Conflicts (${conflicts.length})`);
      for (const c of conflicts) lines.push(`  - ${c.relPath ?? c.target}: ${c.reason}`);
    }
    lines.push("", `Summary: ${JSON.stringify(summary)}`);
    process.stdout.write(lines.join("\n") + "\n");
  }
  process.exitCode = changes ? 1 : 0;
  return { ok: true, exitCode: changes ? 1 : 0 };
}
