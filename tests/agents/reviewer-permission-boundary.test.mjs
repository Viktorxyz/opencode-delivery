import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Regression test for delivery-reviewer agent permission boundary.
 *
 * The v0.1.2 reviewer frontmatter only denies edit/bash/webfetch/etc.
 * but does not isolate the typed mutation tools. A reviewer can call
 * `delivery_merge`, `delivery_issue`, `delivery_worktree` etc. The
 * contract test must assert the frontmatter explicitly allows only
 * `delivery_review` and denies every other `delivery_*` tool.
 */

suite("delivery-reviewer agent permission boundary", { concurrency: false }, () => {
  test("frontmatter allows only delivery_review, denies all other delivery_*", { serial: true }, async () => {
    const path = "assets/agents/delivery-reviewer.md";
    assert.ok(existsSync(path), `${path} must exist`);
    const src = readFileSync(path, "utf8");
    assert.match(src, /^---\n([\s\S]*?)\n---/, "frontmatter must exist");
    const fm = src.match(/^---\n([\s\S]*?)\n---/)[1];
    assert.ok(
      /delivery_review:\s*["']?allow["']?/.test(fm),
      "delivery_review permission must be explicitly allow",
    );
    const mutationTools = [
      "delivery_inspect",
      "delivery_issue",
      "delivery_worktree",
      "delivery_verify",
      "delivery_pr",
      "delivery_ready",
      "delivery_merge",
      "delivery_cleanup",
    ];
    for (const tool of mutationTools) {
      assert.match(
        fm,
        new RegExp(`${tool}:\\s*["']?deny["']?`),
        `${tool} must be explicitly denied`,
      );
    }
  });

  test("frontmatter still instructs delivery_review on pass with headSha", { serial: true }, async () => {
    const path = "assets/agents/delivery-reviewer.md";
    const src = readFileSync(path, "utf8");
    assert.match(src, /delivery_review/, "must reference delivery_review");
    assert.match(src, /head[Ss]ha|head_ref_oid|headRefOid/, "must reference the head SHA");
    assert.match(src, /pass/i, "must mention the pass verdict");
    assert.match(
      src,
      /refuse.+fail|refuse.+blocked|refuse.+partial|do not call.+delivery_review|do not silently record/i,
      "must instruct the reviewer to refuse non-pass verdicts",
    );
  });
});
