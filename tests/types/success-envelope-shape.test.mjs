import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { createIssueTool } from "../../src/index.js";
import { makeFixtureRepo, cleanupFixture } from "../helpers/fixture.mjs";

/**
 * Regression test for success envelope shape parity.
 *
 * The v0.1.2 .d.ts declarations require a discriminated `kind` field
 * on every envelope, but the runtime success envelopes omit `kind`.
 * The fix must either add `kind` on success (e.g. `kind: "ok"`) or
 * mark the success shape as `kind?: never` in declarations. The test
 * pins the runtime behaviour the consumer relies on.
 */

suite("factory success envelopes declare the same shape the runtime emits", { concurrency: false }, () => {
  test("delivery_issue success envelope has issueNumber and manifestPath", { serial: true }, async () => {
    const fixture = makeFixtureRepo();
    try {
      const issue = createIssueTool({
        repoRoot: fixture.dir,
        driver: {
          ensureIssue: async () => ({
            summary: { number: 42, url: "https://example/42", state: "OPEN", pullRequest: null },
            created: true,
          }),
        },
        repoSlug: "a/b",
        owner: "test",
      });
      const r = await issue({
        taskId: "t1",
        title: "T",
        body: "B",
        baseBranch: "main",
        baseSha: "baseSha",
        branch: "backend/t1",
        labels: [],
      });
      assert.equal(typeof r.issueNumber, "number");
      assert.ok(typeof r.manifestPath === "string" && r.manifestPath.length > 0);
    } finally {
      cleanupFixture(fixture);
    }
  });
});
