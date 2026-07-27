import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { loadAdapter } from "../../src/adapter.js";
import { createIssueTool, createWorktreeTool } from "../../src/index.js";
import { makeFixtureRepo, cleanupFixture } from "../helpers/fixture.mjs";
import { readManifest } from "../../src/state/manifest-store.js";

/**
 * Regression tests for delivery_worktree path containment.
 *
 * The v0.1.1 implementation lets the caller pass a
 * `worktreeRelativePath` that resolves outside the adapter's declared
 * `worktree.root`. A `../../` escape (or any absolute path outside
 * the repoRoot) must be refused with a typed `path-escape` envelope
 * before any git worktree create is attempted, and the manifest
 * must not advance state.
 */

async function bootstrapIssue(fixture, adapter, taskId, branch) {
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
    taskId,
    title: "T",
    body: "B",
    baseBranch: "main",
    baseSha: "abc",
    branch,
    labels: [],
  });
}

suite("delivery_worktree path containment", { concurrency: false }, () => {
  test("refuses a path that escapes the adapter's worktree.root via ../", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      await bootstrapIssue(fixture, adapter, "t1", "backend/t1");
      const worktree = createWorktreeTool({
        repoRoot: fixture.dir,
        remote: "origin",
        adapter: {
          ...adapter.adapter,
          worktree: {
            ...adapter.adapter.worktree,
            root: ".worktrees",
          },
        },
      });
      const r = await worktree({
        taskId: "t1",
        branch: "backend/t1",
        worktreeRelativePath: ".worktrees/../../escape",
      });
      assert.equal(r.kind, "path-escape");
      const manifest = await readManifest(fixture.dir, "t1");
      assert.equal(manifest.state, "issue-linked", "state must not advance");
      assert.equal(manifest.worktreePath, null);
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("refuses an absolute path outside repoRoot", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      await bootstrapIssue(fixture, adapter, "t2", "backend/t2");
      const worktree = createWorktreeTool({
        repoRoot: fixture.dir,
        remote: "origin",
        adapter: adapter.adapter,
      });
      const r = await worktree({
        taskId: "t2",
        branch: "backend/t2",
        worktreeRelativePath: "/tmp/abs-escape",
      });
      assert.equal(r.kind, "path-escape");
    } finally {
      cleanupFixture(fixture);
    }
  });
});
