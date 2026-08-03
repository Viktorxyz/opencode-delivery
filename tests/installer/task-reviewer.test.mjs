/*
 * Unit tests for src/installer/task-reviewer.js,
 * src/installer/build-ownership.js, and
 * src/installer/three-round-breaker.js.
 *
 * The M3 task loop runs:
 *   1. implementer writes a report to disk
 *   2. task reviewer emits separate Spec and Quality verdicts
 *   3. build assembles the immutable review package and decides
 *      whether to commit
 *   4. after three failed rounds, the breaker requests a GPT
 *      plan revision
 *
 * Tests cover each module's contract in isolation. The
 * integration (run end-to-end) is exercised by the e2e test
 * suite and the smoke in `.git/opencode-ship/plans/`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  emitSpecVerdict,
  emitQualityVerdict,
  assembleReviewPackage,
} from "../../src/installer/task-reviewer.js";
import { shouldCommit, buildOwnsCommit } from "../../src/installer/build-ownership.js";
import { shouldRequestPlanRevision, MAX_FIX_ROUNDS } from "../../src/installer/three-round-breaker.js";

const goodPlan = (revision = 1) => ({
  version: 1,
  revision,
  parentIssue: "Viktorxyz/opencode-ship#22",
  baseSha: "abc1234",
  architecture: "M3 task loop runs implementer + reviewer + build, persists to runs/<taskId>/.",
  globalConstraints: ["M3 task loop is compact-safe: chat sees pointers, not artifacts."],
  fileResponsibilities: [
    { path: "src/installer/run-store.js", role: "run state persistence" },
  ],
  tasks: [{
    id: "task-reviewer",
    description: "Add the task reviewer module",
    interfaces: ["emitSpecVerdict", "emitQualityVerdict", "assembleReviewPackage"],
    testSeams: ["verdicts have distinct shape"],
    commands: ["npm run test -- task-reviewer"],
    expectedEvidence: "task-reviewer.test.mjs passes",
  }],
  acceptance: ["Spec and Quality verdicts are separate verdicts"],
  outOfScope: ["GPT final-review model (Task 9)"],
  recovery: ["Read the run ledger; resume the active task brief."],
});

test("emitSpecVerdict: produces a Spec verdict with blocking findings only", () => {
  const v = emitSpecVerdict({
    taskId: "task-reviewer",
    planHash: "deadbeef",
    revision: 1,
    fixRound: 0,
    findings: [
      { kind: "blocking", pointer: "/src/installer/run-store.js", reason: "missing readProgress" },
    ],
  });
  assert.equal(v.taskId, "task-reviewer");
  assert.equal(v.specKind, "spec");
  assert.equal(v.findings.length, 1);
});

test("emitQualityVerdict: produces a Quality verdict with style + duplication findings", () => {
  const v = emitQualityVerdict({
    taskId: "task-reviewer",
    planHash: "deadbeef",
    revision: 1,
    fixRound: 0,
    findings: [
      { kind: "duplication", pointer: "/src/installer/x.js", reason: "duplicates y.js" },
    ],
  });
  assert.equal(v.qualityKind, "quality");
  assert.equal(v.findings[0].kind, "duplication");
});

test("assembleReviewPackage: produces an immutable package that includes both verdicts and the plan hash", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "review-pkg-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  // Seed a run dir with a brief snapshot.
  const { ensureRunDir, writeProgress, writePlanRevision } = await import("../../src/installer/run-store.js");
  const { computePlanHash } = await import("../../src/installer/plan.js");
  const plan = goodPlan();
  // The package reads the plan hash from the active plan, so
  // first persist a plan so the run dir exists with a valid
  // plan revision; the package's planHash is computed from the
  // plan argument, not the file.
  await ensureRunDir(root, "task-reviewer");
  await writeProgress(root, "task-reviewer", { taskId: "task-reviewer", startedAt: "2026-08-03T00:00:00Z" });
  const planHash = computePlanHash(plan);
  const spec = emitSpecVerdict({ taskId: "task-reviewer", planHash, revision: 1, fixRound: 0, findings: [] });
  const quality = emitQualityVerdict({ taskId: "task-reviewer", planHash, revision: 1, fixRound: 0, findings: [] });
  const pkg = await assembleReviewPackage(root, "task-reviewer", plan, { specVerdict: spec, qualityVerdict: quality });
  assert.equal(pkg.taskId, "task-reviewer");
  assert.equal(pkg.specVerdict.specKind, "spec");
  assert.equal(pkg.qualityVerdict.qualityKind, "quality");
  assert.equal(pkg.planHash, planHash);
  // The package file is on disk and parseable.
  const raw = JSON.parse(await readFile(join(root, ".git", "opencode-ship", "runs", "task-reviewer", "reports", "review-package.json"), "utf8"));
  assert.equal(raw.taskId, "task-reviewer");
});

test("shouldCommit: yes when both verdicts are pass", () => {
  const spec = emitSpecVerdict({ taskId: "x", planHash: "h", revision: 1, fixRound: 0, findings: [] });
  const quality = emitQualityVerdict({ taskId: "x", planHash: "h", revision: 1, fixRound: 0, findings: [] });
  assert.equal(shouldCommit(spec, quality), true);
});

test("shouldCommit: no when either verdict is blocking", () => {
  const spec = emitSpecVerdict({ taskId: "x", planHash: "h", revision: 1, fixRound: 0, findings: [{ kind: "blocking", pointer: "/a", reason: "r" }] });
  const quality = emitQualityVerdict({ taskId: "x", planHash: "h", revision: 1, fixRound: 0, findings: [] });
  assert.equal(shouldCommit(spec, quality), false);
});

test("buildOwnsCommit: only returns true after both verdicts pass and the package is sealed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "build-owns-"));
  t.after(async () => rm(root, { recursive: true, force: true }));
  const { ensureRunDir, writeProgress } = await import("../../src/installer/run-store.js");
  await ensureRunDir(root, "x");
  await writeProgress(root, "x", { taskId: "x", startedAt: "2026-08-03T00:00:00Z" });
  // Missing verdicts: build does not own the commit.
  assert.equal(await buildOwnsCommit(root, "x", goodPlan(), null, null), false);
  // Verdict present but no package: build does not own the commit.
  const spec = emitSpecVerdict({ taskId: "x", planHash: "h", revision: 1, fixRound: 0, findings: [] });
  const quality = emitQualityVerdict({ taskId: "x", planHash: "h", revision: 1, fixRound: 0, findings: [] });
  assert.equal(await buildOwnsCommit(root, "x", goodPlan(), spec, quality), false);
  // Sealed package + passing verdicts: build owns the commit.
  await assembleReviewPackage(root, "x", goodPlan(), { specVerdict: spec, qualityVerdict: quality });
  assert.equal(await buildOwnsCommit(root, "x", goodPlan(), spec, quality), true);
});

test("MAX_FIX_ROUNDS: 3 (the breaker threshold)", () => {
  assert.equal(MAX_FIX_ROUNDS, 3);
});

test("shouldRequestPlanRevision: yes only when fixRound >= MAX_FIX_ROUNDS", () => {
  assert.equal(shouldRequestPlanRevision(0), false);
  assert.equal(shouldRequestPlanRevision(1), false);
  assert.equal(shouldRequestPlanRevision(2), false);
  assert.equal(shouldRequestPlanRevision(3), true);
  assert.equal(shouldRequestPlanRevision(4), true);
});
