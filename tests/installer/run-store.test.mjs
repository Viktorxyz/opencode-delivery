/*
 * Unit tests for src/installer/run-store.js and
 * src/installer/task-brief.js.
 *
 * The run store persists task state under
 * `.git/opencode-ship/runs/<taskId>/`. The task brief generator
 * extracts the active task slice from a multi-task plan; the
 * runtime MUST see only the active task plus the plan header
 * (so compact context stays small).
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ensureRunDir,
  writeProgress,
  readProgress,
  recordCommitRange,
  readCommitRanges,
} from "../../src/installer/run-store.js";
import {
  buildTaskBrief,
  renderCompactContext,
} from "../../src/installer/task-brief.js";

const goodPlan = (revision = 1) => ({
  version: 1,
  revision,
  parentIssue: "Viktorxyz/opencode-ship#22",
  baseSha: "abc1234",
  architecture: "M3 task loop runs implementer + reviewer + build, persists to runs/<taskId>/.",
  globalConstraints: [
    "Implementer writes full reports to disk; runtime stays compact.",
  ],
  fileResponsibilities: [
    { path: "src/installer/run-store.js", role: "run state persistence" },
  ],
  tasks: [
    {
      id: "run-dir",
      description: "Add the run-store module",
      interfaces: ["ensureRunDir", "writeProgress", "readProgress"],
      testSeams: ["goodRunDir", "progress round-trip"],
      commands: ["npm run test -- run-store"],
      expectedEvidence: "run-store.test.mjs passes",
    },
    {
      id: "brief",
      description: "Add the task brief generator",
      interfaces: ["buildTaskBrief"],
      testSeams: ["active task only"],
      commands: ["npm run test -- task-brief"],
      expectedEvidence: "task-brief.test.mjs passes",
    },
  ],
  acceptance: [
    "M3 task loop runs end-to-end and persists run state",
  ],
  outOfScope: [
    "M3 task reviewer agents (Task 7 step 3)",
  ],
  recovery: [
    "Read the active task brief; run `node scripts/run-resume.js <taskId>` to continue.",
  ],
});

test("ensureRunDir: creates runs/<taskId>/ under .git/opencode-ship/", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "run-store-"));
  t.after(async => rm(root, { recursive: true, force: true }));
  const dir = await ensureRunDir(root, "run-dir");
  assert.ok(dir.endsWith(join(".git", "opencode-ship", "runs", "run-dir")));
});

test("writeProgress / readProgress: round-trip the progress file", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "run-store-"));
  t.after(async => rm(root, { recursive: true, force: true }));
  await ensureRunDir(root, "round-trip");
  await writeProgress(root, "round-trip", { taskId: "round-trip", startedAt: "2026-08-03T00:00:00Z", fixRound: 0 });
  const got = await readProgress(root, "round-trip");
  assert.equal(got.taskId, "round-trip");
  assert.equal(got.fixRound, 0);
});

test("recordCommitRange / readCommitRanges: append-only commit ledger", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "run-store-"));
  t.after(async => rm(root, { recursive: true, force: true }));
  await ensureRunDir(root, "ledger");
  await recordCommitRange(root, "ledger", { from: "abc", to: "def", note: "first" });
  await recordCommitRange(root, "ledger", { from: "def", to: "ghi", note: "second" });
  const got = await readCommitRanges(root, "ledger");
  assert.equal(got.length, 2);
  assert.equal(got[0].note, "first");
  assert.equal(got[1].note, "second");
});

test("recordCommitRange: rejects re-records of the same from-sha", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "run-store-"));
  t.after(async => rm(root, { recursive: true, force: true }));
  await ensureRunDir(root, "dedupe");
  await recordCommitRange(root, "dedupe", { from: "abc", to: "def" });
  await assert.rejects(
    () => recordCommitRange(root, "dedupe", { from: "abc", to: "zzz" }),
    /already/,
  );
});

test("buildTaskBrief: returns only the active task plus plan header", () => {
  const brief = buildTaskBrief(goodPlan(), "run-dir");
  // The brief carries the plan header (version, revision, parent,
  // baseSha) plus the active task. It must NOT carry the other
  // task's description.
  assert.equal(brief.activeTaskId, "run-dir");
  assert.equal(brief.parentIssue, "Viktorxyz/opencode-ship#22");
  assert.match(brief.description, /Add the run-store module/);
  assert.equal(brief.revision, 1);
  // Other task descriptions are absent.
  assert.doesNotMatch(JSON.stringify(brief), /Add the task brief generator/);
});

test("buildTaskBrief: throws when the active task is not in the plan", () => {
  assert.throws(() => buildTaskBrief(goodPlan(), "not-in-plan"), /not in the plan/);
});

test("renderCompactContext: emits pointers, not full artifacts", () => {
  const ctx = renderCompactContext({
    taskId: "run-dir",
    planHash: "deadbeef",
    revision: 1,
    fixRound: 0,
    pendingGate: "ready-for-review",
    recoveryCommand: "node scripts/run-resume.js run-dir",
  });
  // Each field is a short pointer; no full plan or report body.
  assert.match(ctx, /task-id=run-dir/);
  assert.match(ctx, /plan-hash=deadbeef/);
  assert.match(ctx, /revision=1/);
  assert.match(ctx, /fix-round=0/);
  assert.match(ctx, /pending-gate=ready-for-review/);
  assert.match(ctx, /recovery=node scripts\/run-resume\.js run-dir/);
  // The plan JSON itself must not appear here.
  assert.doesNotMatch(ctx, /Add the run-store module/);
});
