import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { checkGates, gateSnapshot, gateFailureEnvelope, bucketFor } from "../../src/gates.js";

function adapterFixture(requiredChecks = ["delivery-verify"]) {
  return {
    adapter: {
      ci: { requiredChecks, driver: "github-status-checks", wait: false, flakyRetry: 0 },
      ready: { requires: ["review", "local-verification", "remote-ci"], stopAfterReady: true },
    },
  };
}

suite("gates", { concurrency: false }, () => {
  test("bucketFor maps known buckets", { serial: true }, () => {
    assert.equal(bucketFor({ bucket: "pass" }), "pass");
    assert.equal(bucketFor({ bucket: "fail" }), "fail");
    assert.equal(bucketFor({ bucket: "pending" }), "pending");
    assert.equal(bucketFor({ state: "success" }), "pass");
    assert.equal(bucketFor({ state: "failure" }), "fail");
    assert.equal(bucketFor(undefined), "pending");
  });

  test("gateSnapshot partitions required checks", { serial: true }, () => {
    const snap = gateSnapshot({
      manifest: adapterFixture(["delivery-verify", "lint"]),
      prHead: "abc",
      checks: [{ name: "delivery-verify", state: "success", bucket: "pass" }],
    });
    assert.deepEqual(snap.failingChecks, []);
    assert.deepEqual(snap.missingChecks, ["lint"]);
    assert.deepEqual(snap.pendingChecks, ["lint"]);
  });

  test("checkGates returns missing-review when reviewer SHA is unset", { serial: true }, () => {
    const m = { ...adapterFixture(), lastReviewerSha: null, lastVerifierSha: "abc" };
    const result = checkGates({ manifest: m, prHead: "abc", checks: [], requires: ["review"] });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "missing-review");
  });

  test("checkGates returns head-changed-after-review on SHA drift", { serial: true }, () => {
    const m = { ...adapterFixture(), lastReviewerSha: "old", lastVerifierSha: "abc" };
    const result = checkGates({ manifest: m, prHead: "new", checks: [], requires: ["review"] });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "head-changed-after-review");
  });

  test("checkGates returns ci-pending when a required check is pending", { serial: true }, () => {
    const m = { ...adapterFixture(), lastReviewerSha: "abc", lastVerifierSha: "abc" };
    const result = checkGates({
      manifest: m,
      prHead: "abc",
      checks: [{ name: "delivery-verify", state: "in_progress", bucket: "pending" }],
      requires: ["review", "local-verification", "remote-ci"],
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "ci-pending");
  });

  test("checkGates returns ci-failing when a required check failed", { serial: true }, () => {
    const m = { ...adapterFixture(), lastReviewerSha: "abc", lastVerifierSha: "abc" };
    const result = checkGates({
      manifest: m,
      prHead: "abc",
      checks: [{ name: "delivery-verify", state: "failure", bucket: "fail" }],
      requires: ["review", "local-verification", "remote-ci"],
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "ci-failing");
  });

  test("checkGates returns ci-missing when no result for a required check", { serial: true }, () => {
    const m = { ...adapterFixture(), lastReviewerSha: "abc", lastVerifierSha: "abc" };
    const result = checkGates({
      manifest: m,
      prHead: "abc",
      checks: [],
      requires: ["review", "local-verification", "remote-ci"],
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "ci-missing");
  });

  test("checkGates passes when every gate is fresh", { serial: true }, () => {
    const m = { ...adapterFixture(), lastReviewerSha: "abc", lastVerifierSha: "abc" };
    const result = checkGates({
      manifest: m,
      prHead: "abc",
      checks: [{ name: "delivery-verify", state: "success", bucket: "pass" }],
      requires: ["review", "local-verification", "remote-ci"],
    });
    assert.equal(result.ok, true);
  });

  test("checkGates respects requires opt-out", { serial: true }, () => {
    const m = { ...adapterFixture(), lastReviewerSha: null, lastVerifierSha: null };
    const result = checkGates({
      manifest: m,
      prHead: "abc",
      checks: [],
      requires: [],
    });
    assert.equal(result.ok, true);
  });

  test("gateFailureEnvelope maps each reason", { serial: true }, () => {
    const m = adapterFixture();
    const snap = gateSnapshot({ manifest: m, prHead: "abc", checks: [] });
    assert.equal(gateFailureEnvelope({ reason: "missing-review", snapshot: snap }).kind, "missing-gate");
    assert.equal(gateFailureEnvelope({ reason: "missing-verifier", snapshot: snap }).kind, "missing-gate");
    assert.equal(gateFailureEnvelope({ reason: "head-changed-after-review", snapshot: snap }).kind, "head-changed-after-review");
    assert.equal(gateFailureEnvelope({ reason: "head-changed-after-verifier", snapshot: snap }).kind, "head-changed-after-verifier");
    assert.equal(gateFailureEnvelope({ reason: "ci-missing", snapshot: snap }).kind, "ci-missing");
    assert.equal(gateFailureEnvelope({ reason: "ci-failing", snapshot: snap }).kind, "ci-failing");
    assert.equal(gateFailureEnvelope({ reason: "ci-pending", snapshot: snap }).kind, "ci-pending");
    assert.equal(gateFailureEnvelope({ reason: "unknown", snapshot: snap }).kind, "gate-failed");
  });
});
