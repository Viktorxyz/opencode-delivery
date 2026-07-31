/*
 * Contract tests for the verifier agent.
 *
 * The verifier must explicitly allow ONLY delivery_verify. All other
 * delivery_* tools must be explicitly denied. The agent must instruct
 * itself never to invoke bash directly, never to run the project
 * verification command, and to surface blocked state when the
 * manifest is missing.
 */

import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const PATH = "assets/agents/delivery-verifier.md";

suite("delivery-verifier agent contract", { concurrency: false }, () => {
  test("frontmatter exists", { serial: true }, () => {
    assert.ok(existsSync(PATH));
  });

  test("frontmatter allows only delivery_verify, denies all other delivery_*", { serial: true }, () => {
    const src = readFileSync(PATH, "utf8");
    const fm = src.match(/^---\n([\s\S]*?)\n---/)[1];
    assert.match(fm, /^\s*delivery_verify:\s*allow/m, "delivery_verify must be allow");
    for (const tool of [
      "delivery_inspect",
      "delivery_issue",
      "delivery_worktree",
      "delivery_review",
      "delivery_pr",
      "delivery_ready",
      "delivery_merge",
      "delivery_cleanup",
    ]) {
      assert.match(
        fm,
        new RegExp(`^\\s*${tool}:\\s*deny`, "m"),
        `${tool} must be denied`,
      );
    }
  });

  test("frontmatter denies bash entirely", { serial: true }, () => {
    const src = readFileSync(PATH, "utf8");
    const fm = src.match(/^---\n([\s\S]*?)\n---/)[1];
    assert.match(fm, /^\s*bash:\s*deny/m, "bash must be denied for verifier");
  });
});
