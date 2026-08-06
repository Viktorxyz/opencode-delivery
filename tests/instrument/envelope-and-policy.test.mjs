/*
 * Tests for the contract-version-2 envelope and the GitHub
 * command policy. These are the foundation every typed Ship
 * tool depends on.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { success, failure, isSuccess, isFailure, CONTRACT_VERSION, operationId } from "../../src/tools/envelope.js";
import { validateGhArgv, allowedGhVerbs } from "../../src/drivers/github-command-policy.js";

test("envelope: success returns a v2 success envelope", () => {
  const env = success("issue-create", { issueNumber: 12, url: "https://example" });
  assert.equal(env.contractVersion, CONTRACT_VERSION);
  assert.equal(env.ok, true);
  assert.equal(env.kind, "issue-create");
  assert.equal(env.data.issueNumber, 12);
  assert.equal(typeof env.operationId, "string");
  assert.ok(env.operationId.startsWith("issue-create-"));
  assert.equal(env.idempotent, true);
});

test("envelope: failure returns a v2 failure envelope", () => {
  const env = failure("gh-rejected", "gh api is not allowed", { retryable: false, details: { argv: ["gh", "api"] } });
  assert.equal(env.contractVersion, CONTRACT_VERSION);
  assert.equal(env.ok, false);
  assert.equal(env.kind, "gh-rejected");
  assert.equal(env.retryable, false);
  assert.equal(env.message, "gh api is not allowed");
  assert.deepEqual(env.details, { argv: ["gh", "api"] });
});

test("envelope: success rejects empty kind", () => {
  assert.throws(() => success("", {}), /kind must be a non-empty string/);
});

test("envelope: failure rejects empty message", () => {
  assert.throws(() => failure("kind", ""), /message must be a non-empty string/);
});

test("envelope: isSuccess discriminates with kind", () => {
  const env = success("pr-merge", { sha: "abc" });
  assert.equal(isSuccess(env), true);
  assert.equal(isSuccess(env, "pr-merge"), true);
  assert.equal(isSuccess(env, "other-kind"), false);
  assert.equal(isSuccess({ contractVersion: 1, ok: true, kind: "x" }), false);
  assert.equal(isSuccess(null), false);
  assert.equal(isSuccess("string"), false);
});

test("envelope: isFailure discriminates", () => {
  const env = failure("err", "msg");
  assert.equal(isFailure(env), true);
  assert.equal(isFailure({ contractVersion: 1, ok: false, kind: "x" }), false);
  assert.equal(isFailure(null), false);
  assert.equal(isFailure(success("k", {})), false);
});

test("envelope: operationId is unique and prefixed", () => {
  const a = operationId("foo");
  const b = operationId("foo");
  assert.notEqual(a, b);
  assert.ok(a.startsWith("foo-"));
});

test("gh-policy: accepts every documented verb", () => {
  for (const verb of allowedGhVerbs()) {
    const argv = ["gh", ...verb.split(" "), "--json", "number"];
    const r = validateGhArgv(argv);
    assert.equal(r.ok, true, `expected ${verb} to be allowed, got ${r.reason}`);
    assert.equal(r.verb, verb);
  }
});

test("gh-policy: rejects gh api", () => {
  const r = validateGhArgv(["gh", "api", "/repos/owner/repo"]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /gh api/);
});

test("gh-policy: rejects gh api with a sub-path", () => {
  const r = validateGhArgv(["gh", "api", "graphql", "-f", "query={}" ]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /gh api/);
});

test("gh-policy: rejects unknown subcommand", () => {
  const r = validateGhArgv(["gh", "release", "create"]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /allowlist/);
});

test("gh-policy: rejects --web", () => {
  const r = validateGhArgv(["gh", "pr", "create", "--web"]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /--web/);
});

test("gh-policy: rejects --body-file", () => {
  const r = validateGhArgv(["gh", "issue", "comment", "1", "--body-file", "/tmp/x"]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /--body-file/);
});

test("gh-policy: rejects empty argv", () => {
  const r = validateGhArgv([]);
  assert.equal(r.ok, false);
});

test("gh-policy: rejects non-array", () => {
  const r = validateGhArgv("gh issue list");
  assert.equal(r.ok, false);
});

test("gh-policy: rejects non-gh binary", () => {
  const r = validateGhArgv(["git", "status"]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /expected 'gh' binary/);
});

test("gh-policy: rejects empty arg", () => {
  const r = validateGhArgv(["gh", "issue", "list", ""]);
  assert.equal(r.ok, false);
  assert.match(r.reason, /non-empty strings/);
});
