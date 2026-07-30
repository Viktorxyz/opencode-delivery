/*
 * opencode-ship command: diff.
 *
 * Read-only. Reports the same plan `init` would commit, with no
 * filesystem mutation. Exit 0 = no changes, exit 1 = changes.
 */

import { previewInstall } from "../executor.js";

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
  const { plan, conflicts, summary, migrationReport } = preview;
  const changes = summary.create + summary.update + summary.delete + summary.conflict;
  const safePlan = plan.filter(Boolean).map((op) => {
    const { bytes, ...rest } = op ?? {};
    return bytes && Buffer.isBuffer(bytes) ? { ...rest, bytesLength: bytes.length } : rest;
  });
  if (options.json) {
    process.stdout.write(JSON.stringify({
      reportVersion: 1, command: "diff",
      status: conflicts.length > 0 ? "conflict" : changes ? "changed" : "noop",
      plan: safePlan, conflicts, summary,
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
