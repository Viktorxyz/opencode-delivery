import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { loadAdapter } from "../../src/adapter.js";
import { createInspectTool } from "../../src/tools/delivery-inspect.js";
import { createIssueTool } from "../../src/tools/delivery-issue.js";
import { makeFixtureRepo, cleanupFixture } from "../helpers/fixture.mjs";

function fixedRunner(responses) {
  let i = 0;
  return async () => {
    const next = responses[i++] ?? { status: 0, stdout: "", stderr: "" };
    return next;
  };
}

suite("delivery_inspect", { concurrency: false }, () => {
  test("returns doctor + manifest envelope", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      assert.equal(adapter.ok, true);
      const tool = createInspectTool({
        repoRoot: fixture.dir,
        packageVersion: "opencode-delivery@0.1.1",
        adapter: adapter.adapter,
      });
      const r = await tool({ taskId: "no-such" });
      assert.equal(r.contractVersion, 1);
      assert.equal(r.manifest, null);
      assert.ok(Array.isArray(r.doctor.checks));
      assert.ok(r.doctor.checks.find((c) => c.name === "adapter contract v1"));
    } finally {
      cleanupFixture(fixture);
    }
  });
});

suite("delivery_issue", { concurrency: false }, () => {
  test("creates an issue, writes manifest, idempotent on second call", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const adapter = await loadAdapter(fixture.dir);
      let ensureCalls = 0;
      const driver = {
        ensureIssue: async () => {
          ensureCalls++;
          if (ensureCalls === 1) {
            return {
              summary: {
                number: 42,
                url: "https://github.com/a/b/issues/42",
                state: "OPEN",
                pullRequest: null,
              },
              created: true,
            };
          }
          return {
            summary: { number: 42, url: "u", state: "OPEN", pullRequest: null },
            created: false,
          };
        },
      };
      const tool = createIssueTool({
        repoRoot: fixture.dir,
        driver,
        repoSlug: "a/b",
        owner: "test",
      });
      const first = await tool({
        taskId: "t1",
        title: "T",
        body: "B",
        baseBranch: "main",
        baseSha: "abc",
        branch: "backend/t1",
        labels: ["enhancement"],
      });
      assert.equal(first.kind, undefined);
      assert.equal(first.created, true);
      assert.equal(first.issueNumber, 42);

      const second = await tool({
        taskId: "t1",
        title: "T",
        body: "B",
        baseBranch: "main",
        baseSha: "abc",
        branch: "backend/t1",
        labels: ["enhancement"],
      });
      assert.equal(second.created, false);
      assert.equal(second.issueNumber, 42);
    } finally {
      cleanupFixture(fixture);
    }
  });

  test("rejects missing input fields", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const tool = createIssueTool({
        repoRoot: fixture.dir,
        driver: { ensureIssue: async () => ({ summary: { number: 1, url: "u", state: "OPEN", pullRequest: null }, created: true }) },
        repoSlug: "a/b",
        owner: "test",
      });
      const r = await tool({
        taskId: "",
        title: "t",
        body: "b",
        baseBranch: "main",
        baseSha: "a",
        branch: "b/t",
        labels: [],
      });
      assert.deepEqual(r, { kind: "missing-input", field: "taskId" });
    } finally {
      cleanupFixture(fixture);
    }
  });
});
