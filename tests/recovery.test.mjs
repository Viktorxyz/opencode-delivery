import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { wouldCleanupBeSafe } from "../src/recovery.js";

suite("recovery", { concurrency: false }, () => {
test("wouldCleanupBeSafe accepts the canonical safe shape", { serial: true }, () => {
  assert.equal(
    wouldCleanupBeSafe({
      prMerged: true,
      worktreeClean: true,
      rebaseInProgress: false,
      headMatchesPr: true,
      baseMatches: true,
    }),
    true,
  );
});

test("wouldCleanupBeSafe rejects every unsafe signal", { serial: true }, () => {
  const base = { prMerged: true, worktreeClean: true, rebaseInProgress: false, headMatchesPr: true, baseMatches: true };
  for (const [k, v] of [
    ["prMerged", false],
    ["worktreeClean", false],
    ["rebaseInProgress", true],
    ["headMatchesPr", false],
    ["baseMatches", false],
  ]) {
    assert.equal(wouldCleanupBeSafe({ ...base, [k]: v }), false);
  }
});
});
