/*
 * Unit tests for src/installer/plan-mirror.js.
 *
 * The mirror uploads the approved plan to the parent issue as a
 * marked comment so the GPT final-reviewer and humans can trace
 * the durable artifact without leaving the ticket. Tests use a
 * stub GitHub client so the test does not depend on `gh` or
 * network availability.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mirrorPlanToIssue, buildPlanCommentBody, PLAN_COMMENT_MARKER } from "../../src/installer/plan-mirror.js";

const goodPlan = () => ({
  version: 1,
  revision: 1,
  parentIssue: "Viktorxyz/opencode-ship#21",
  baseSha: "abc1234",
  architecture: "Plan Mode is a sub-agent with broad-deny source edits and narrow-allow plans/ writes.",
  globalConstraints: ["Plan content is durable; runtime reads only path + hash + revision."],
  fileResponsibilities: [{ path: "src/installer/plan.js", role: "plan loader and validator" }],
  tasks: [{
    id: "schema",
    description: "Add plan schema and validator",
    interfaces: ["validatePlan"],
    testSeams: ["goodPlan has no issues"],
    commands: ["npm run test --plan"],
    expectedEvidence: "schema.test.mjs passes",
  }],
  acceptance: ["Plan mode round-trips through validatePlan"],
  outOfScope: ["Plan persistence (Task 7)"],
  recovery: ["Run validatePlan; re-export from the plan JSON"],
});

function stubClient({ failFirst = 0, replies = [] } = {}) {
  let calls = 0;
  return {
    calls: 0,
    async postComment(owner, repo, issue, body) {
      calls += 1;
      this.calls = calls;
      if (calls <= failFirst) throw new Error(`stub failure ${calls}`);
      replies.push({ owner, repo, issue, body });
      return { url: `https://example.com/${owner}/${repo}/issues/${issue}#issuecomment-${calls}` };
    },
  };
}

test("PLAN_COMMENT_MARKER: starts with the stable opencode-ship-execution-handoff marker", () => {
  assert.match(PLAN_COMMENT_MARKER, /^opencode-ship-execution-handoff:v\d+/);
});

test("buildPlanCommentBody: contains the plan hash and the stable marker", () => {
  const body = buildPlanCommentBody(goodPlan());
  assert.match(body, new RegExp(PLAN_COMMENT_MARKER));
  assert.match(body, /plan-sha256=[0-9a-f]{64}/);
  assert.match(body, /revision=1/);
  assert.match(body, /"parentIssue": "Viktorxyz\/opencode-ship#21"/);
});

test("mirrorPlanToIssue: posts a single comment with the marker", async () => {
  const client = stubClient();
  const result = await mirrorPlanToIssue(goodPlan(), { client, owner: "Viktorxyz", repo: "opencode-ship", issueNumber: 21 });
  assert.equal(client.calls, 1);
  assert.match(result.url, /example\.com/);
});

test("mirrorPlanToIssue: retries on transient failure then succeeds", async () => {
  const client = stubClient({ failFirst: 2 });
  const result = await mirrorPlanToIssue(goodPlan(), { client, owner: "Viktorxyz", repo: "opencode-ship", issueNumber: 21, retries: 3 });
  assert.equal(client.calls, 3);
  assert.match(result.url, /example\.com/);
});

test("mirrorPlanToIssue: gives up after exhausting retries", async () => {
  const client = stubClient({ failFirst: 5 });
  await assert.rejects(
    () => mirrorPlanToIssue(goodPlan(), { client, owner: "Viktorxyz", repo: "opencode-ship", issueNumber: 21, retries: 2 }),
    /stub failure/,
  );
});
