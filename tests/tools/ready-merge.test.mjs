import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { loadAdapter } from "../../src/adapter.js";
import { createReadyTool, createMergeTool, createCleanupTool } from "../../src/index.js";
import { makeFixtureRepo, cleanupFixture } from "../helpers/fixture.mjs";
import { writeManifest, readManifest } from "../../src/state/manifest-store.js";

function manifest(repoRoot, taskId, overrides) {
  return {
    schemaVersion: 1,
    taskId,
    repoIdentity: "a/b",
    issueNumber: 1,
    prNumber: 7,
    baseBranch: "main",
    baseSha: "abc",
    branch: "backend/t1",
    worktreePath: `${repoRoot}/.worktrees/backend-t1`,
    lastPrHeadSha: "abc",
    lastReviewerSha: "abc",
    lastVerifierSha: "abc",
    owner: "test",
    state: "validating",
    transitionLog: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function driverWith({ headSha = "abc", merged = false, mergeable = "MERGEABLE", checks = [{ name: "delivery-verify", state: "success", bucket: "pass" }] } = {}) {
  return {
    refreshHead: async () => headSha,
    readPullRequest: async () => ({
      number: 7,
      url: "u",
      baseRefName: "main",
      headRefName: "backend/t1",
      headSha,
      draft: false,
      mergeable,
      mergeStateStatus: "CLEAN",
      merged,
      mergedAt: merged ? new Date().toISOString() : null,
    }),
    readChecks: async () => checks,
    markReady: async () => {},
    mergePullRequest: async () => ({
      number: 7,
      url: "u",
      baseRefName: "main",
      headRefName: "backend/t1",
      headSha,
      draft: false,
      mergeable,
      mergeStateStatus: "CLEAN",
      merged: true,
      mergedAt: new Date().toISOString(),
    }),
    comment: async () => {},
  };
}

suite("delivery_ready", { concurrency: false }, () => {
  test("refuses with missing-gate when reviewer SHA is unset", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      await writeManifest(fixture.dir, manifest(fixture.dir, "t1", { lastReviewerSha: null }));
      const tool = createReadyTool({
        repoRoot: fixture.dir,
        driver: driverWith(),
        repoSlug: "a/b",
        owner: "test",
        adapter: adapter.adapter,
      });
      const r = await tool({ taskId: "t1" });
      assert.equal(r.kind, "missing-gate");
      assert.equal(r.gate, "review");
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("refuses when reviewer SHA drifts from PR head", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      await writeManifest(fixture.dir, manifest(fixture.dir, "t1", { lastReviewerSha: "old" }));
      const tool = createReadyTool({
        repoRoot: fixture.dir,
        driver: driverWith({ headSha: "new" }),
        repoSlug: "a/b",
        owner: "test",
        adapter: adapter.adapter,
      });
      const r = await tool({ taskId: "t1" });
      assert.equal(r.kind, "head-changed-after-review");
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("refuses when CI is pending", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      await writeManifest(fixture.dir, manifest(fixture.dir, "t1"));
      const tool = createReadyTool({
        repoRoot: fixture.dir,
        driver: driverWith({
          checks: [{ name: "delivery-verify", state: "in_progress", bucket: "pending" }],
        }),
        repoSlug: "a/b",
        owner: "test",
        adapter: adapter.adapter,
      });
      const r = await tool({ taskId: "t1" });
      assert.equal(r.kind, "ci-pending");
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("refuses when CI is failing", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      await writeManifest(fixture.dir, manifest(fixture.dir, "t1"));
      const tool = createReadyTool({
        repoRoot: fixture.dir,
        driver: driverWith({
          checks: [{ name: "delivery-verify", state: "failure", bucket: "fail" }],
        }),
        repoSlug: "a/b",
        owner: "test",
        adapter: adapter.adapter,
      });
      const r = await tool({ taskId: "t1" });
      assert.equal(r.kind, "ci-failing");
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("marks Ready when every gate is fresh", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      await writeManifest(fixture.dir, manifest(fixture.dir, "t1", { state: "validating" }));
      const tool = createReadyTool({
        repoRoot: fixture.dir,
        driver: driverWith(),
        repoSlug: "a/b",
        owner: "test",
        adapter: adapter.adapter,
      });
      const r = await tool({ taskId: "t1" });
      assert.equal(r.contractVersion, 1);
      assert.equal(r.pr, 7);
      const m = await readManifest(fixture.dir, "t1");
      assert.equal(m.state, "ready");
    } finally {
      cleanupFixture(fixture);
    }
  });
});

suite("delivery_merge", { concurrency: false }, () => {
  test("refuses with not-ready when manifest state is wrong", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      await writeManifest(fixture.dir, manifest(fixture.dir, "t1", { state: "validating" }));
      const tool = createMergeTool({
        repoRoot: fixture.dir,
        driver: driverWith(),
        repoSlug: "a/b",
        owner: "test",
        adapter: adapter.adapter,
      });
      const r = await tool({ taskId: "t1", subject: "fix(t1): merge" });
      assert.equal(r.kind, "not-ready");
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("refuses with wrong-base when PR base differs", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      await writeManifest(fixture.dir, manifest(fixture.dir, "t1", { state: "ready" }));
      const tool = createMergeTool({
        repoRoot: fixture.dir,
        driver: driverWith(),
        repoSlug: "a/b",
        owner: "test",
        adapter: adapter.adapter,
      });
      const r = await tool({ taskId: "t1", subject: "x" });
      assert.equal(r.contractVersion, 1, JSON.stringify(r));
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("performs squash merge when Ready and gates are fresh", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      await writeManifest(fixture.dir, manifest(fixture.dir, "t1", { state: "ready" }));
      const tool = createMergeTool({
        repoRoot: fixture.dir,
        driver: driverWith(),
        repoSlug: "a/b",
        owner: "test",
        adapter: adapter.adapter,
      });
      const r = await tool({ taskId: "t1", subject: "fix(t1): merge" });
      assert.equal(r.contractVersion, 1, JSON.stringify(r));
      assert.equal(r.kind, "merge", `expected kind=merge envelope, got ${JSON.stringify(r)}`);
      assert.equal(r.taskId, "t1");
      const m = await readManifest(fixture.dir, "t1");
      assert.equal(m.state, "merged");
    } finally {
      cleanupFixture(fixture);
    }
  });
});
