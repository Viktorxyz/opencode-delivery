/*
 * Stable report builders for the CLI.
 *
 * `human` renders text suitable for a terminal. `json` renders a
 * single typed envelope with `command`, `status`, `actions`,
 * `conflicts`, `diagnostics`, and `exitCode`. The envelope version
 * is bumped if we add fields in a backward-compatible way.
 */

export const REPORT_VERSION = 1;

function pad(p) {
  return p.replace(/^/, "  ");
}

export function summarise(plan) {
  const counts = { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0 };
  for (const op of plan) {
    if (counts[op.kind] !== undefined) counts[op.kind] += 1;
  }
  return counts;
}

export function renderHuman({ command, plan, conflicts, summary, diagnostics = [] }) {
  const head = `# opencode-ship ${command}`;
  if (!plan.length && !conflicts.length) {
    return [head, "", "No changes.", ...diagnostics.map((d) => pad(`- ${d}`))].join("\n");
  }
  const sections = [head, "", `## Plan`];
  for (const op of plan) {
    sections.push(pad(`- ${op.kind.padEnd(9)} ${op.relPath ?? op.target}${op.reason ? ` — ${op.reason}` : ""}`));
  }
  if (conflicts.length) {
    sections.push("", `## Conflicts (${conflicts.length})`);
    for (const c of conflicts) {
      sections.push(pad(`- ${c.relPath ?? c.target}: ${c.reason}`));
    }
  }
  if (diagnostics.length) {
    sections.push("", "## Diagnostics");
    for (const d of diagnostics) sections.push(pad(`- ${d}`));
  }
  sections.push("", `Summary: ${JSON.stringify(summary)}`);
  return sections.join("\n");
}

export function renderJson({ command, plan, conflicts, summary, diagnostics = [], exitCode }) {
  return JSON.stringify({
    reportVersion: REPORT_VERSION,
    command,
    status: conflicts.length > 0 ? "conflict" : "ok",
    plan,
    conflicts,
    summary,
    diagnostics,
    exitCode,
  }, null, 2);
}
