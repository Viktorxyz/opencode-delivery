import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { loadAdapter } from "../../src/adapter.js";
import { createIssueTool, createWorktreeTool } from "../../src/index.js";
import { makeFixtureRepo, cleanupFixture } from "../helpers/fixture.mjs";

function stubDriver() {
  return {
    ensureIssue: async () => ({
      summary: { number: 1, url: "https://example/issues/1", state: "OPEN", pullRequest: null },
      created: true,
    }),
  };
}

suite("delivery_worktree", { concurrency: false }, () => {
  test("creates a worktree, runs bootstrap, records manifest", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      const issue = createIssueTool({
        repoRoot: fixture.dir,
        driver: stubDriver(),
        repoSlug: "a/b",
        owner: "test",
      });
      await issue({
        taskId: "t1",
        title: "T",
        body: "B",
        baseBranch: "main",
        baseSha: "abc",
        branch: "backend/t1",
        labels: [],
      });

      const bootstrapMarker = `${fixture.dir}/.opencode/bootstrap-ran`;
      const worktree = createWorktreeTool({
        repoRoot: fixture.dir,
        remote: "origin",
        adapter: { ...adapter.adapter, worktree: { ...adapter.adapter.worktree, bootstrap: [["touch", bootstrapMarker]] } },
      });
      const r = await worktree({
        taskId: "t1",
        branch: "backend/t1",
        worktreeRelativePath: ".worktrees/backend-t1",
      });
      assert.equal(r.contractVersion, 1, `unexpected envelope: ${JSON.stringify(r)}`);
      assert.equal(r.branch, "backend/t1");
      assert.match(r.headSha, /^[0-9a-f]{40}$/);
      const { statSync } = await import("node:fs");
      assert.ok(statSync(bootstrapMarker).isFile(), "bootstrap did not run");
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("refuses when branch already exists locally", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      const issue = createIssueTool({
        repoRoot: fixture.dir,
        driver: stubDriver(),
        repoSlug: "a/b",
        owner: "test",
      });
      await issue({
        taskId: "t2",
        title: "T",
        body: "B",
        baseBranch: "main",
        baseSha: "abc",
        branch: "backend/t2",
        labels: [],
      });
      const worktree = createWorktreeTool({
        repoRoot: fixture.dir,
        remote: "origin",
        adapter: adapter.adapter,
      });
      const r1 = await worktree({
        taskId: "t2",
        branch: "backend/t2",
        worktreeRelativePath: ".worktrees/backend-t2",
      });
      assert.equal(r1.contractVersion, 1);
      const r2 = await worktree({
        taskId: "t2",
        branch: "backend/t2",
        worktreeRelativePath: ".worktrees/backend-t2b",
      });
      assert.equal(r2.kind, "branch-exists-locally");
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("returns manifest-state when manifest is in wrong state", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      const worktree = createWorktreeTool({
        repoRoot: fixture.dir,
        remote: "origin",
        adapter: adapter.adapter,
      });
      const r = await worktree({
        taskId: "never",
        branch: "x/y",
        worktreeRelativePath: ".worktrees/x",
      });
      assert.equal(r.kind, "missing-manifest");
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("fails when bootstrap argv is invalid", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      const issue = createIssueTool({
        repoRoot: fixture.dir,
        driver: stubDriver(),
        repoSlug: "a/b",
        owner: "test",
      });
      await issue({
        taskId: "t3",
        title: "T",
        body: "B",
        baseBranch: "main",
        baseSha: "abc",
        branch: "backend/t3",
        labels: [],
      });
      const worktree = createWorktreeTool({
        repoRoot: fixture.dir,
        remote: "origin",
        adapter: { ...adapter.adapter, worktree: { ...adapter.adapter.worktree, bootstrap: [[]] } },
      });
      const r = await worktree({
        taskId: "t3",
        branch: "backend/t3",
        worktreeRelativePath: ".worktrees/backend-t3",
      });
      assert.equal(r.kind, "bootstrap-invalid");
    } finally {
      cleanupFixture(fixture);
    }
  });
});
