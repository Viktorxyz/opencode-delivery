/*
 * Commit gate, three-round breaker, and supporting tests.
 *
 * The commit gate is the deterministic controller's last
 * line of defense before staging and committing the
 * builder's output. The three-round breaker caps how many
 * `fail` verdicts a single task can accumulate before the
 * controller requests a new strong-model plan revision.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { checkCommitEligibility, runCommandForGate } from "../../src/workflow/commit-gate.js";
import {
  applyReviewVerdict,
  advanceRound,
  initialRoundState,
  MAX_FAILED_ROUNDS,
} from "../../src/workflow/three-round-breaker.js";

const HEX40 = /^[0-9a-f]{40}$/;

function baseInput(overrides = {}) {
  return {
    planHash: "a".repeat(64),
    taskId: "t1",
    round: 1,
    taskBaseHead: "a".repeat(40),
    currentHead: "a".repeat(40),
    workspaceHash: "b".repeat(64),
    reviewedWorkspaceHash: "b".repeat(64),
    reviewVerdict: "pass",
    reviewFindings: [],
    changedPaths: ["src/a.js"],
    allowedPaths: ["src/a.js"],
    ...overrides,
  };
}

test("commit-gate: ok on a clean pass", () => {
  const r = checkCommitEligibility(baseInput());
  assert.equal(r.ok, true);
});

test("commit-gate: rejects a non-pass verdict", () => {
  const r = checkCommitEligibility(baseInput({ reviewVerdict: "fail" }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "review-not-pass");
});

test("commit-gate: rejects blocking findings even with pass verdict", () => {
  const r = checkCommitEligibility(baseInput({ reviewFindings: [{ severity: "blocking" }] }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "blocking-findings");
});

test("commit-gate: rejects a head mismatch", () => {
  const r = checkCommitEligibility(baseInput({ currentHead: "different".padEnd(40, "0") }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "head-mismatch");
});

test("commit-gate: rejects a workspace drift", () => {
  const r = checkCommitEligibility(baseInput({ workspaceHash: "c".repeat(64) }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "workspace-drift");
});

test("commit-gate: rejects out-of-scope paths", () => {
  const r = checkCommitEligibility(baseInput({ changedPaths: ["src/a.js", "src/secret.js"], allowedPaths: ["src/a.js"] }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, "out-of-scope-paths");
});

test("commit-gate: ok when no paths changed", () => {
  const r = checkCommitEligibility(baseInput({ changedPaths: [], allowedPaths: ["src/a.js"] }));
  assert.equal(r.ok, true);
});

test("runCommandForGate: ok on a passing command", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "gate-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const r = runCommandForGate({ argv: ["node", "-e", "process.exit(0)"], cwd: dir, timeoutMs: 5000, expect: { exitCode: 0 } });
  assert.equal(r.ok, true);
  assert.equal(r.exitCode, 0);
});

test("runCommandForGate: rejects a non-zero exit", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "gate-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const r = runCommandForGate({ argv: ["node", "-e", "process.exit(7)"], cwd: dir, timeoutMs: 5000, expect: { exitCode: 0 } });
  assert.equal(r.ok, false);
  assert.match(r.reason, /exit=7/);
});

test("runCommandForGate: rejects missing argv", () => {
  const r = runCommandForGate({ argv: [], cwd: "/tmp", timeoutMs: 1000, expect: { exitCode: 0 } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "missing-argv");
});

test("three-round: initial state is building on round 1", () => {
  const s = initialRoundState();
  assert.equal(s.round, 1);
  assert.equal(s.state, "building");
  assert.equal(s.failedRounds, 0);
});

test("three-round: pass verdict completes the task", () => {
  const s = applyReviewVerdict(initialRoundState(), { verdict: "pass" });
  assert.equal(s.state, "completed");
});

test("three-round: three fail verdicts trigger revision_required", () => {
  let s = initialRoundState();
  s = applyReviewVerdict(s, { verdict: "fail" });
  s = advanceRound(s);
  s = applyReviewVerdict(s, { verdict: "fail" });
  s = advanceRound(s);
  s = applyReviewVerdict(s, { verdict: "fail" });
  assert.equal(s.state, "revision_required");
  assert.equal(s.failedRounds, MAX_FAILED_ROUNDS);
});

test("three-round: two fail verdicts move to fix_pending", () => {
  let s = initialRoundState();
  s = applyReviewVerdict(s, { verdict: "fail" });
  s = advanceRound(s);
  s = applyReviewVerdict(s, { verdict: "fail" });
  assert.equal(s.state, "fix_pending");
  assert.equal(s.failedRounds, 2);
});

test("three-round: advanceRound is a no-op outside fix_pending", () => {
  const s = advanceRound(initialRoundState());
  assert.equal(s.round, 1);
  assert.equal(s.state, "building");
});

void HEX40;
void spawnSync;
void writeFile;
