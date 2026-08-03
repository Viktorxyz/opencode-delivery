/*
 * Unit tests for src/installer/plan-store.js.
 *
 * Plans are append-only on disk: revision N+1 is allowed only
 * after revision N is approved (locked). The store refuses
 * to overwrite an existing plan and refuses to write a plan
 * whose revision does not match the expected next revision.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  readPlanRevision,
  writePlanRevision,
  listPlanRevisions,
} from "../../src/installer/plan-store.js";

const PARENT = "Viktorxyz/opencode-ship#21";
const goodPlan = (revision) => ({
  version: 1,
  revision,
  parentIssue: PARENT,
  baseSha: "abc1234",
  architecture: "Plan Mode is a sub-agent with broad-deny source edits and narrow-allow plans/ writes.",
  globalConstraints: ["Plan content is durable; runtime reads only path + hash + revision."],
  fileResponsibilities: [{ path: "src/installer/plan.js", role: "plan loader and validator" }],
  tasks: [{
    id: "schema",
    description: "Add plan schema and validator",
    interfaces: ["validatePlan"],
    testSeams: ["goodPlan has no issues"],
    commands: ["npm run test --plan"],
    expectedEvidence: "schema.test.mjs passes",
  }],
  acceptance: ["Plan mode round-trips through validatePlan"],
  outOfScope: ["Plan persistence (Task 7)"],
  recovery: ["Run validatePlan; re-export from the plan JSON"],
});

test("readPlanRevision: returns null for a missing plan", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "plan-store-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  assert.equal(await readPlanRevision(dir, PARENT), null);
  assert.equal(await readPlanRevision(dir, PARENT, 1), null);
});

test("writePlanRevision: writes revision 1 to the canonical path", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "plan-store-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const path = await writePlanRevision(dir, goodPlan(1));
  assert.ok(path.endsWith("revision-0001.json"));
  const round = JSON.parse(await readFile(path, "utf8"));
  assert.equal(round.revision, 1);
});

test("writePlanRevision: rejects a plan that fails validatePlan", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "plan-store-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const bad = { ...goodPlan(1), version: 99 };
  await assert.rejects(() => writePlanRevision(dir, bad), /version/);
});

test("writePlanRevision: append-only — refuses to overwrite the same revision", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "plan-store-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await writePlanRevision(dir, goodPlan(1));
  await assert.rejects(() => writePlanRevision(dir, goodPlan(1)), /append-only|exists|already/);
});

test("writePlanRevision: append-only — refuses to skip revisions (only N+1 is allowed)", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "plan-store-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await writePlanRevision(dir, goodPlan(1));
  await assert.rejects(() => writePlanRevision(dir, goodPlan(3)), /expected revision 2/);
});

test("writePlanRevision: accepts the next revision after the previous one is on disk", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "plan-store-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await writePlanRevision(dir, goodPlan(1));
  const path = await writePlanRevision(dir, goodPlan(2));
  assert.ok(path.endsWith("revision-0002.json"));
});

test("readPlanRevision: returns the most recent on-disk plan when no revision given", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "plan-store-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await writePlanRevision(dir, goodPlan(1));
  await writePlanRevision(dir, goodPlan(2));
  const p = await readPlanRevision(dir, PARENT);
  assert.equal(p.revision, 2);
});

test("listPlanRevisions: returns the revisions in ascending order", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "plan-store-"));
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await writePlanRevision(dir, goodPlan(1));
  await writePlanRevision(dir, goodPlan(2));
  const revs = await listPlanRevisions(dir, PARENT);
  assert.deepEqual(revs, [1, 2]);
});
