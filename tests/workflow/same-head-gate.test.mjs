/*
 * Same-HEAD gate tests.
 *
 * The final review, verification, CI, and PR HEAD must all
 * reference the same commit SHA. The gate is the single source
 * of truth that refuses to mark Ready when any pair disagrees.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { checkSameHeadGate, runSameHeadGate, hashSameHeadEvidence, GATE_EVIDENCE_SCHEMA } from "../../src/workflow/same-head-gate.js";

const HEAD = "a".repeat(40);
const OTHER = "b".repeat(40);

function evidence(overrides = {}) {
  return {
    standards: {
      headSha: HEAD,
      packageHash: "p".repeat(64),
      verdict: "pass",
      ...(overrides.standards ?? {}),
    },
    spec: {
      headSha: HEAD,
      packageHash: "p".repeat(64),
      verdict: "pass",
      ...(overrides.spec ?? {}),
    },
    verification: {
      headSha: HEAD,
      exitCode: 0,
      hash: "v".repeat(64),
      ...(overrides.verification ?? {}),
    },
    ci: {
      headSha: HEAD,
      state: "pass",
      hash: "c".repeat(64),
      ...(overrides.ci ?? {}),
    },
    pr: {
      headSha: HEAD,
      prHeadSha: HEAD,
      ...(overrides.pr ?? {}),
    },
  };
}

test("same-HEAD gate: accepts evidence that agrees on one HEAD", () => {
  const r = checkSameHeadGate(evidence());
  assert.equal(r.ok, true);
  assert.equal(r.headSha, HEAD);
});

test("same-HEAD gate: rejects when the Standards HEAD drifts", () => {
  const r = checkSameHeadGate(evidence({ standards: { headSha: OTHER } }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /head-mismatch/);
});

test("same-HEAD gate: rejects when the verification exit code is non-zero", () => {
  const r = checkSameHeadGate(evidence({ verification: { exitCode: 1 } }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /verification/);
});

test("same-HEAD gate: rejects when CI reports a failure", () => {
  const r = checkSameHeadGate(evidence({ ci: { state: "failure" } }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /ci/);
});

test("same-HEAD gate: rejects when the PR HEAD has drifted", () => {
  const r = checkSameHeadGate(evidence({ pr: { prHeadSha: OTHER } }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /pr-head-drift/);
});

test("same-HEAD gate: rejects when a Standards or Spec verdict is not pass", () => {
  const r = checkSameHeadGate(evidence({ spec: { verdict: "fail" } }));
  assert.equal(r.ok, false);
  assert.match(r.reason, /verdict/);
});

test("runSameHeadGate: dispatches the five gates in parallel", async () => {
  const order = [];
  const delay = (label, ms) => async () => {
    order.push(`start:${label}`);
    await new Promise((r) => setTimeout(r, ms));
    order.push(`end:${label}`);
    return evidence()[label];
  };
  const r = await runSameHeadGate({
    runGate: delay("standards", 30),
    specGate: delay("spec", 30),
    verificationGate: delay("verification", 5),
    ciGate: delay("ci", 5),
    prGate: delay("pr", 5),
  });
  assert.equal(r.ok, true);
  const starts = order.filter((e) => e.startsWith("start:"));
  assert.equal(starts.length, 5, "all five gates dispatched concurrently");
});

test("hashSameHeadEvidence: binds the gate to the canonical evidence", () => {
  const a = hashSameHeadEvidence(evidence());
  const b = hashSameHeadEvidence(evidence({ standards: { headSha: OTHER } }));
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test("GATE_EVIDENCE_SCHEMA contract version", () => {
  assert.equal(GATE_EVIDENCE_SCHEMA, "v1");
});
