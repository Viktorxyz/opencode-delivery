/*
 * Unit tests for src/installer/compaction.js and
 * src/installer/commit-binding.js.
 *
 * The compaction hook is called when the chat context overflows;
 * it injects the short pointer set so the consumer can resume
 * without losing state. The commit binding records the
 * immutable commit range to the ledger after Build's review
 * passes; this is the audit trail that ties a HEAD back to its
 * approved review package.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderCompactContext } from "../../src/installer/task-brief.js";
import { buildCompactionContext, compactContextForRun } from "../../src/installer/compaction.js";
import { recordApprovedCommit } from "../../src/installer/commit-binding.js";
import { readCommitRanges } from "../../src/installer/run-store.js";

test("renderCompactContext: emits the documented pointer shape", () => {
  const out = renderCompactContext({
    taskId: "task-reviewer",
    planHash: "deadbeef",
    revision: 1,
    fixRound: 0,
    pendingGate: "ready-for-review",
    recoveryCommand: "node scripts/run-resume.js task-reviewer",
  });
  assert.match(out, /task-id=task-reviewer/);
  assert.match(out, /plan-hash=deadbeef/);
});

test("buildCompactionContext: returns the full object the chat hook injects", () => {
  const ctx = buildCompactionContext({
    taskId: "task-reviewer",
    planHash: "deadbeef",
    revision: 1,
    fixRound: 0,
    pendingGate: "ready-for-review",
    recoveryCommand: "node scripts/run-resume.js task-reviewer",
    ledgerEntryCount: 0,
  });
  assert.equal(ctx.taskId, "task-reviewer");
  assert.equal(ctx.ledgerEntryCount, 0);
  assert.equal(ctx.recoveryCommand, "node scripts/run-resume.js task-reviewer");
});

test("compactContextForRun: reads ledger state and merges it into the pointer set", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "compact-"));
  t.after(async => rm(root, { recursive: true, force: true }));
  const { ensureRunDir, recordCommitRange } = await import("../../src/installer/run-store.js");
  await ensureRunDir(root, "x");
  await recordCommitRange(root, "x", { from: "abc", to: "def" });
  await recordCommitRange(root, "x", { from: "def", to: "ghi" });
  const ctx = await compactContextForRun(root, "x", {
    taskId: "x",
    planHash: "h",
    revision: 1,
    fixRound: 0,
    pendingGate: "ready-for-build",
    recoveryCommand: "node scripts/run-resume.js x",
  });
  assert.equal(ctx.ledgerEntryCount, 2);
  assert.equal(ctx.pendingGate, "ready-for-build");
});

test("recordApprovedCommit: writes one ledger entry and ignores duplicate from-sha", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bind-"));
  t.after(async => rm(root, { recursive: true, force: true }));
  const { ensureRunDir } = await import("../../src/installer/run-store.js");
  await ensureRunDir(root, "x");
  await recordApprovedCommit(root, "x", { from: "abc", to: "def", note: "task-reviewer" });
  const ranges = await readCommitRanges(root, "x");
  assert.equal(ranges.length, 1);
  assert.equal(ranges[0].from, "abc");
  // Recording the same from-sha again is rejected (the ledger is
  // append-only; use a different from for chained commits).
  await assert.rejects(
    () => recordApprovedCommit(root, "x", { from: "abc", to: "zzz" }),
    /already/,
  );
});
