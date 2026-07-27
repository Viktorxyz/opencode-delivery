import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { createGhDriver } from "/home/viktorcordas/repos/_bootstrap/opencode-delivery/src/drivers/gh-cli.ts";
import { parseRepoSlug } from "/home/viktorcordas/repos/_bootstrap/opencode-delivery/src/drivers/github.ts";

suite("github driver", { concurrency: false }, () => {
test("parseRepoSlug accepts owner/name", { serial: true }, () => {
  assert.deepEqual(parseRepoSlug("a/b"), { owner: "a", name: "b" });
});

test("parseRepoSlug rejects malformed inputs", { serial: true }, () => {
  assert.equal(parseRepoSlug(""), null);
  assert.equal(parseRepoSlug("a"), null);
  assert.equal(parseRepoSlug("a/"), null);
  assert.equal(parseRepoSlug("/b"), null);
});

test("createGhDriver returns a well-formed driver", { serial: true }, () => {
  const d = createGhDriver();
  for (const k of [
    "ensureIssue",
    "openDraftPullRequest",
    "updatePullRequestBody",
    "markReady",
    "mergePullRequest",
    "readPullRequest",
    "readChecks",
    "comment",
    "refreshHead",
    "applyMergeToManifest",
  ]) {
    assert.equal(typeof d[k], "function");
  }
});
});
