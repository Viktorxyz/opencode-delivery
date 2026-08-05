/*
 * Plan store tests.
 *
 * The store persists PlanV2 records under
 * `<git-common-dir>/opencode-ship/plans/<workflowId>/revisions/<NNNN>/`
 * with one directory per revision. Each revision is immutable;
 * re-submitting the same hash is a no-op; re-submitting a
 * different plan with the same revision is rejected.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  publishPlanRevision,
  publishApproval,
  publishMirrorReceipt,
  listRevisions,
  readPlanRevision,
  readLatestPlan,
  plansRoot,
} from "../../src/workflow/plan-store.js";
import { validatePlanV2, computePlanHash, SUPPORTED_SCHEMA_VERSION } from "../../src/workflow/plan.js";

async function makeRepo() {
  const dir = await mkdtemp(join(tmpdir(), "plans-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@local", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@local" };
  spawnSync("git", ["init", "-b", "main"], { cwd: dir, env });
  spawnSync("git", ["config", "user.email", "t@local"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "# t\n");
  spawnSync("git", ["add", "README.md"], { cwd: dir, env });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir, env });
  return dir;
}

function validPlan(overrides = {}) {
  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    workflowId: "wf-1",
    revision: 1,
    supersedes: null,
    authoredBy: {
      sessionID: "session-1",
      model: "openai/gpt-5.6-sol",
      createdAt: new Date().toISOString(),
    },
    source: {
      repository: "owner/repo",
      issueNumber: 1,
      issueUrl: "https://github.com/owner/repo/issues/1",
      baseBranch: "main",
      baseSha: "0123456789abcdef0123456789abcdef01234567",
    },
    goal: "ship the canonical planv2 contract",
    architecture: { summary: "ok", decisions: [] },
    constraints: [],
    files: [{ path: "src/x.js", action: "create", responsibility: "x", taskIds: ["t1"] }],
    tasks: [
      {
        id: "t1",
        ordinal: 1,
        title: "x",
        objective: "x",
        dependsOn: [],
        preconditions: [],
        changes: [{ path: "src/x.js", operation: "create", symbols: [], instructions: ["do it"], preserve: ["keep public api"] }],
        interfaces: [],
        tests: [{ file: "tests/x.test.mjs", cases: [{ name: "a", setup: [], action: "x()", assertions: ["true"] }] }],
        commands: [{ argv: ["node", "--test", "tests/x.test.mjs"], cwd: "worktree", timeoutMs: 1000, expect: { exitCode: 0, stdoutIncludes: [], stderrExcludes: [] } }],
        acceptance: [{ id: "a", assertion: "ok", evidence: ["passes"] }],
        commit: { message: "feat: x" },
      },
    ],
    finalAcceptance: [],
    outOfScope: [],
    recovery: [],
    ...overrides,
  };
}

test("plan-store: publishPlanRevision writes a record under the common-dir", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const r = await publishPlanRevision(dir, validPlan());
  assert.equal(r.recorded, true);
  assert.ok(r.path.endsWith("plans/wf-1/revisions/000001/plan.json"));
  assert.match(r.hash, /^[0-9a-f]{64}$/);
  const read = await readPlanRevision(dir, "wf-1", 1);
  assert.equal(read.hash, r.hash);
  assert.equal(read.plan.workflowId, "wf-1");
});

test("plan-store: re-submitting the same plan is a no-op", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const plan = validPlan();
  const r1 = await publishPlanRevision(dir, plan);
  const r2 = await publishPlanRevision(dir, plan);
  assert.equal(r1.recorded, true);
  assert.equal(r2.recorded, false);
});

test("plan-store: rejects an invalid plan", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await assert.rejects(
    () => publishPlanRevision(dir, { ...validPlan(), workflowId: "" }),
    /publishPlanRevision: invalid plan/,
  );
});

test("plan-store: listRevisions returns every persisted revision in order", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await publishPlanRevision(dir, validPlan({ revision: 1 }));
  await publishPlanRevision(dir, validPlan({ revision: 2, goal: "ship a different plan" }));
  const list = await listRevisions(dir, "wf-1");
  assert.equal(list.length, 2);
  assert.equal(list[0].revision, 1);
  assert.equal(list[1].revision, 2);
});

test("plan-store: readLatestPlan returns the highest revision", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await publishPlanRevision(dir, validPlan({ revision: 1 }));
  await publishPlanRevision(dir, validPlan({ revision: 2, goal: "ship another plan" }));
  const latest = await readLatestPlan(dir, "wf-1");
  assert.equal(latest.revision, 2);
});

test("plan-store: publishApproval writes an approval record", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await publishPlanRevision(dir, validPlan());
  const r = await publishApproval(dir, {
    workflowId: "wf-1",
    revision: 1,
    decision: "approved",
    sessionID: "session-1",
    approvedBy: "user-1",
    approvedAt: new Date().toISOString(),
    chunkIds: ["1", "2"],
    chunkHashes: ["a".repeat(64), "b".repeat(64)],
    baseSha: "0123456789abcdef0123456789abcdef01234567",
    models: { planner: "openai/gpt-5.6-sol", builder: "minimax/MiniMax-M3", finalReviewer: "openai/gpt-5.6-sol" },
  });
  assert.equal(r.recorded, true);
  const list = await listRevisions(dir, "wf-1");
  assert.equal(list[0].approvalPath, r.path);
});

test("plan-store: publishMirrorReceipt writes a mirror record", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await publishPlanRevision(dir, validPlan());
  const r = await publishMirrorReceipt(dir, {
    workflowId: "wf-1",
    revision: 1,
    issueNumber: 1,
    chunkIds: ["1", "2"],
    chunkHashes: ["a".repeat(64), "b".repeat(64)],
    sealedCommentId: "seal-1",
    sealedAt: new Date().toISOString(),
  });
  assert.equal(r.recorded, true);
});

test("plan-store: plansRoot returns the durable state dir under the common dir", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const root = await plansRoot(dir, "wf-1");
  assert.ok(root.includes("opencode-ship/plans/wf-1"));
});

test("plan-store: listRevisions returns empty for unknown workflow", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const list = await listRevisions(dir, "wf-missing");
  assert.equal(list.length, 0);
});

test("plan-store: readPlanRevision returns null for missing", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const v = await readPlanRevision(dir, "wf-1", 99);
  assert.equal(v, null);
});

test("plan-store: validatePlanV2 is the gate before publish", () => {
  const r = validatePlanV2(validPlan());
  assert.equal(r.ok, true);
  const r2 = validatePlanV2({ ...validPlan(), tasks: [] });
  assert.equal(r2.ok, false);
});
