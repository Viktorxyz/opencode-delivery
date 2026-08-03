/*
 * Unit tests for src/installer/plan.js.
 *
 * The plan artifact records the durable GPT-to-MiniMax handoff
 * for every implementation ticket. Tests assert the validator's
 * contract: required fields are enforced, no placeholder text
 * slips through, and approved revisions are append-only and
 * hash-verified.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
  validatePlan,
  computePlanHash,
  planNeedsPlaceholderReview,
  canRevise,
  planSummary,
  DEFAULT_PLAN_VERSION,
} from "../../src/installer/plan.js";

const goodPlan = () => ({
  version: DEFAULT_PLAN_VERSION,
  revision: 1,
  parentIssue: "Viktorxyz/opencode-ship#21",
  baseSha: "abc1234",
  architecture: "Plan Mode is a sub-agent with broad-deny source edits and narrow-allow plans/ writes.",
  globalConstraints: [
    "Plan content is durable; runtime reads only path + hash + revision.",
  ],
  fileResponsibilities: [
    { path: "src/installer/plan.js", role: "plan loader and validator" },
  ],
  tasks: [
    {
      id: "schema",
      description: "Add plan schema and validator",
      interfaces: ["validatePlan"],
      testSeams: ["goodPlan has no issues"],
      commands: ["npm run test --plan"],
      expectedEvidence: "schema.test.mjs passes",
    },
  ],
  acceptance: ["Plan mode round-trips through validatePlan"],
  outOfScope: ["Plan persistence (Task 7)"],
  recovery: ["Run validatePlan; re-export from the plan JSON"],
});

test("DEFAULT_PLAN_VERSION is a positive integer", () => {
  assert.equal(typeof DEFAULT_PLAN_VERSION, "number");
  assert.ok(DEFAULT_PLAN_VERSION >= 1);
});

test("validatePlan: accepts a well-formed plan", () => {
  const r = validatePlan(goodPlan());
  assert.equal(r.ok, true, JSON.stringify(r));
});

test("validatePlan: rejects an unknown version", () => {
  const r = validatePlan({ ...goodPlan(), version: 99 });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "shape");
});

test("validatePlan: rejects a missing required field", () => {
  const bad = goodPlan();
  delete bad.architecture;
  const r = validatePlan(bad);
  assert.equal(r.ok, false);
  assert.equal(r.kind, "shape");
});

test("validatePlan: rejects an empty tasks array", () => {
  const r = validatePlan({ ...goodPlan(), tasks: [] });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "shape");
});

test("validatePlan: rejects a task that is missing required fields", () => {
  const r = validatePlan({
    ...goodPlan(),
    tasks: [{ id: "x" }], // no description, no testSeams, no commands
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "shape");
});

test("computePlanHash: stable for the same plan, different for any change", () => {
  const p1 = goodPlan();
  const p2 = goodPlan();
  assert.equal(computePlanHash(p1), computePlanHash(p2));
  const p3 = { ...p1, architecture: "different" };
  assert.notEqual(computePlanHash(p1), computePlanHash(p3));
});

test("canRevise: revision 1 can be followed by revision 2", () => {
  assert.equal(canRevise({ revision: 1 }, { ...goodPlan(), revision: 2 }), true);
});

test("canRevise: same-revision writes are rejected (append-only)", () => {
  assert.equal(canRevise({ revision: 2 }, { ...goodPlan(), revision: 2 }), false);
});

test("canRevise: backwards jumps are rejected", () => {
  assert.equal(canRevise({ revision: 5 }, { ...goodPlan(), revision: 4 }), false);
});

test("planNeedsPlaceholderReview: detects <placeholder> anywhere", () => {
  const ok = goodPlan();
  const r = planNeedsPlaceholderReview(ok);
  assert.equal(r.ok, true);
  const bad = {
    ...goodPlan(),
    architecture: "We <placeholder> this and that",
  };
  const r2 = planNeedsPlaceholderReview(bad);
  assert.equal(r2.ok, false);
  assert.ok(r2.matches.length > 0);
});

test("planSummary: returns counts and the canonical hash", () => {
  const p = goodPlan();
  const s = planSummary(p);
  assert.equal(s.version, DEFAULT_PLAN_VERSION);
  assert.equal(s.revision, 1);
  assert.equal(s.tasks, 1);
  assert.equal(s.hash, computePlanHash(p));
});
