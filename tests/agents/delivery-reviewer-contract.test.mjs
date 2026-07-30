import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";

/**
 * Regression test for the delivery-reviewer agent contract.
 *
 * The reviewer agent must instruct itself to call delivery_review with
 * the reviewed head SHA on `Status: pass`. Otherwise lastReviewerSha
 * stays null and the Ready gate can never succeed.
 */

suite("delivery-reviewer agent contract", { concurrency: false }, () => {
  test("instructs the reviewer to call delivery_review with the head SHA on pass", { serial: true }, async () => {
    const path = "assets/agents/delivery-reviewer.md";
    assert.ok(existsSync(path), `${path} must exist`);
    const src = await import("node:fs").then((m) => m.readFileSync(path, "utf8"));
    assert.match(src, /delivery_review/, `delivery-reviewer.md must reference delivery_review`);
    assert.match(src, /head[Ss]ha|head_ref_oid|headRefOid/, `must reference the head SHA`);
    assert.match(src, /pass/i, `must mention the pass verdict`);
  });
});
