/*
 * Run state persistence.
 *
 * The M3 task loop persists every run under
 * `.git/opencode-ship/runs/<taskId>/` so the runtime stays
 * compact (the chat pointer references the run, not the run's
 * contents). The store is fail-closed: writes happen in append /
 * replace mode, never in destructive merge mode, so a crashed run
 * is recoverable by re-running the active task.
 *
 * The directory layout is:
 *
 *   .git/opencode-ship/runs/<taskId>/
 *     progress.md           (run-scoped state machine)
 *     ledger.json           (append-only commit ranges)
 *     briefs/<taskId>-r<N>.json (read-only task brief snapshot)
 *     reports/implementer-<runId>.md   (full M3 implementer output)
 *     reports/reviewer-spec-<runId>.md  (task reviewer Spec verdict)
 *     reports/reviewer-quality-<runId>.md (task reviewer Quality verdict)
 *
 * The runtime only ever reads progress.md and ledger.json; the
 * reports are only loaded by Build when assembling the next
 * review package. This is the compact-safe guarantee.
 */

import { mkdir, readFile, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

const RUNS_DIR = ".git/opencode-ship/runs";

function runDirFor(repoRoot, taskId) {
  return join(repoRoot, RUNS_DIR, taskId);
}

export async function ensureRunDir(repoRoot, taskId) {
  if (!taskId) throw new Error("ensureRunDir: taskId is required");
  const dir = runDirFor(repoRoot, taskId);
  await mkdir(join(dir, "briefs"), { recursive: true });
  await mkdir(join(dir, "reports"), { recursive: true });
  return dir;
}

async function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * Persist the current progress file for a run. Replaces the
 * previous progress file (progress.md is a state-machine
 * snapshot, not an append log). The ledger is the append log.
 */
export async function writeProgress(repoRoot, taskId, progress) {
  const dir = await ensureRunDir(repoRoot, taskId);
  await writeJson(join(dir, "progress.md"), progress);
}

export async function readProgress(repoRoot, taskId) {
  const dir = runDirFor(repoRoot, taskId);
  return readJson(join(dir, "progress.md"), null);
}

/**
 * Append an immutable commit range to the ledger. Re-records
 * of the same from-sha are rejected (append-only); the consumer
 * should use a different `from` (the previous range's `to`) for
 * chained records.
 */
export async function recordCommitRange(repoRoot, taskId, { from, to, note }) {
  const dir = await ensureRunDir(repoRoot, taskId);
  const path = join(dir, "ledger.json");
  const ledger = await readJson(path, []);
  if (ledger.some((r) => r.from === from)) {
    throw new Error(
      `recordCommitRange: commit range from "${from}" already recorded for ${taskId} (append-only)`,
    );
  }
  ledger.push({ from, to: to ?? null, note: note ?? null, recordedAt: new Date().toISOString() });
  await writeJson(path, ledger);
  return ledger[ledger.length - 1];
}

export async function readCommitRanges(repoRoot, taskId) {
  const dir = runDirFor(repoRoot, taskId);
  return readJson(join(dir, "ledger.json"), []);
}
