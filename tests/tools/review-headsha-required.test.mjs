import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { loadAdapter } from "../../src/adapter.js";
import { createReviewTool, createIssueTool, createWorktreeTool } from "../../src/index.js";
import { writeManifest } from "../../src/state/manifest-store.js";
import { makeFixtureRepo, cleanupFixture } from "../helpers/fixture.mjs";

/**
 * Regression tests for delivery_review headSha strictness.
 *
 * The v0.1.2 implementation accepts a missing or mismatching `headSha`
 * and falls back to the PR's current head, which lets a reviewer
 * record a SHA they did not actually review. The fix must require an
 * explicit, matching headSha on pass; a mismatched or missing SHA must
 * return a typed envelope and refuse to record.
 */

function manifest(repoRoot, taskId, overrides) {
  return {
    schemaVersion: 1,
    taskId,
    repoIdentity: "a/b",
    issueNumber: 1,
    prNumber: 7,
    baseBranch: "main",
    baseSha: "baseSha",
    branch: "backend/t1",
    worktreePath: null,
    lastPrHeadSha: "headSha",
    lastReviewerSha: null,
    lastVerifierSha: "headSha",
    owner: "test",
    state: "draft-open",
    transitionLog: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

async function bootstrapIssue(fixture) {
  const adapter = await loadAdapter(fixture.dir);
  const issue = createIssueTool({
    repoRoot: fixture.dir,
    driver: {
      ensureIssue: async () => ({
        summary: { number: 1, url: "u", state: "OPEN", pullRequest: null },
        created: true,
      }),
    },
    repoSlug: "a/b",
    owner: "test",
    adapter: adapter.adapter,
  });
  await issue({
    taskId: "t1",
    title: "T",
    body: "B",
    baseBranch: "main",
    baseSha: "baseSha",
    branch: "backend/t1",
    labels: [],
  });
  return adapter.adapter;
}

suite("delivery_review requires explicit matching headSha", { concurrency: false }, () => {
  test("rejects when headSha is omitted on pass", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      await bootstrapIssue(fixture);
      await writeManifest(
        fixture.dir,
        manifest(fixture.dir, "t1", { state: "draft-open" }),
      );
      const driver = {
        refreshHead: async () => "headSha",
      };
      const review = createReviewTool({
        repoRoot: fixture.dir,
        repoSlug: "a/b",
        driver,
      });
      const r = await review({ taskId: "t1", status: "pass" });
      assert.ok(
        r.kind === "head-mismatch" || r.kind === "missing-head-sha",
        `expected missing-head-sha or head-mismatch envelope, got ${JSON.stringify(r)}`,
      );
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("rejects when headSha does not match the PR head", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      await bootstrapIssue(fixture);
      await writeManifest(
        fixture.dir,
        manifest(fixture.dir, "t1", { state: "draft-open" }),
      );
      const driver = {
        refreshHead: async () => "headSha",
      };
      const review = createReviewTool({
        repoRoot: fixture.dir,
        repoSlug: "a/b",
        driver,
      });
      const r = await review({
        taskId: "t1",
        status: "pass",
        headSha: "differentSha",
      });
      assert.equal(r.kind, "head-mismatch");
      assert.equal(r.prHeadSha, "headSha");
      assert.equal(r.reviewSha, "differentSha");
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("records when headSha matches the PR head", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      await bootstrapIssue(fixture);
      await writeManifest(
        fixture.dir,
        manifest(fixture.dir, "t1", { state: "draft-open" }),
      );
      const driver = {
        refreshHead: async () => "headSha",
      };
      const review = createReviewTool({
        repoRoot: fixture.dir,
        repoSlug: "a/b",
        driver,
      });
      const r = await review({
        taskId: "t1",
        status: "pass",
        headSha: "headSha",
      });
      assert.equal(r.reviewerSha, "headSha");
      assert.ok(r.manifestPath, "expected manifestPath in success envelope");
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("non-pass verdict returns review-not-pass without recording", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      await bootstrapIssue(fixture);
      await writeManifest(
        fixture.dir,
        manifest(fixture.dir, "t1", { state: "draft-open" }),
      );
      const driver = {
        refreshHead: async () => "headSha",
      };
      const review = createReviewTool({
        repoRoot: fixture.dir,
        repoSlug: "a/b",
        driver,
      });
      const r = await review({ taskId: "t1", status: "fail" });
      assert.equal(r.kind, "review-not-pass");
      assert.equal(r.status, "fail");
    } finally {
      cleanupFixture(fixture);
    }
  });
});
