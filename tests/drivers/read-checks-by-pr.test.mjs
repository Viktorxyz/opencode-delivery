import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { createGhDriver } from "../../src/drivers/gh-cli.js";

/**
 * Regression tests for readChecks PR-identity resolution.
 *
 * The v0.1.1 implementation always queries GitHub by commit SHA. The
 * production `gh pr checks` CLI expects a PR identity (number, URL,
 * or branch), not a SHA. The driver must prefer the PR number when
 * it is known, and fall back to SHA only when the caller passes it
 * explicitly.
 */

suite("readChecks prefers PR identity", { concurrency: false }, () => {
  test("queries by PR number when a number is provided", { serial: true }, async () => {
    const calls = [];
    const runner = async (args) => {
      calls.push(args);
      return {
        status: 0,
        stdout: JSON.stringify([{ name: "lint", state: "success", bucket: "pass" }]),
        stderr: "",
      };
    };
    const driver = createGhDriver({ runner });
    const out = await driver.readChecks({
      repo: "a/b",
      number: 7,
      sha: "abc",
      required: ["lint"],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].name, "lint");
    assert.ok(calls[0].includes("7"), `expected PR number 7 in argv, got: ${calls[0]}`);
    assert.ok(!calls[0].includes("abc") || calls[0].indexOf("abc") > calls[0].indexOf("7"));
  });

  test("queries by branch when only branch is provided", { serial: true }, async () => {
    const calls = [];
    const runner = async (args) => {
      calls.push(args);
      return {
        status: 0,
        stdout: JSON.stringify([]),
        stderr: "",
      };
    };
    const driver = createGhDriver({ runner });
    await driver.readChecks({
      repo: "a/b",
      branch: "feature/seed",
      required: ["lint"],
    });
    assert.ok(calls[0].includes("feature/seed"));
  });
});
