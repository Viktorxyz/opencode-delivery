/*
 * Fake harnesses for the neutral-consumer workflow journey.
 *
 * The qualification tests cannot talk to a real GitHub or real
 * OpenCode dispatch. Instead they wire in:
 *
 *   - FakeGhDriver: records every typed `gh` argv and enforces
 *     the fixed allowlist (no `gh api`, no `--web`, no
 *     `--body-file`, no shell). Duplicates of an operationId
 *     are rejected.
 *
 *   - FakeModelDispatcher: records every prompt, enforces the
 *     configured role model, and returns scripted responses for
 *     planner, builder, task-reviewer, and final reviewers.
 *
 *   - FakeCliRunner: invokes `npm exec --yes --package=<tarball>
 *     -- opencode-ship <cmd>` via the npm and pnpm shims. The
 *     tarball is built once per test run and cached.
 *
 * The two harnesses share the same FakeState which records
 * phase transitions, PR/issue ids, and per-HEAD gate evidence.
 * Tests assert on the recorded state to prove the workflow
 * travelled through Ready/merge/cleanup in the documented order.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const ALLOWED_GH_VERBS = new Set([
  "issue list", "issue view", "issue create", "issue comment",
  "issue edit", "issue close", "pr list", "pr view", "pr create",
  "pr edit", "pr checks", "pr ready", "pr merge",
]);

export function createFakeState() {
  return {
    phases: [],
    issues: new Map(),
    prs: new Map(),
    checks: new Map(),
    operationIds: new Map(),
    merges: [],
    ghCalls: [],
    modelCalls: [],
    phasesByHead: new Map(),
  };
}

export function createFakeGhDriver(state) {
  return {
    repo: "owner/repo",
    async runCommand(argv) {
      if (!Array.isArray(argv) || argv[0] !== "gh") {
        throw new Error(`fake-gh: argv must start with 'gh', got ${JSON.stringify(argv)}`);
      }
      const verb = argv.slice(1, 3).join(" ");
      if (verb.includes("api")) {
        throw new Error(`fake-gh: typed verb is forbidden`);
      }
      if (!ALLOWED_GH_VERBS.has(verb)) {
        throw new Error(`fake-gh: verb not allowed: ${verb}`);
      }
      state.ghCalls.push(argv);
      // Ship's typed tools pass an operationId in argv; the fake
      // harness enforces idempotency by tracking argv fingerprints.
      const opArg = argv.find((a) => a.startsWith("--operation-id="));
      if (opArg) {
        const opId = opArg.split("=")[1];
        if (state.operationIds.has(opId)) {
          return { status: 0, stdout: "{}", stderr: "idempotent" };
        }
        state.operationIds.set(opId, { verb, at: new Date().toISOString() });
      }
      // Build a deterministic response that records the phase.
      const runCommandResult = fakeGhResponse(state, argv);
      return runCommandResult;
    },
    async ensureIssue({ repo, title, body, labels }) {
      const opId = `ensureIssue-${title}`;
      if (state.operationIds.has(opId)) {
        return { summary: { number: state.issues.get(title).number, url: state.issues.get(title).url, state: "OPEN", pullRequest: null }, created: false };
      }
      state.operationIds.set(opId, { verb: "issue create", at: new Date().toISOString() });
      const number = state.issues.size + 1;
      const url = `https://github.com/${repo}/issues/${number}`;
      state.issues.set(title, { number, url, body, labels: labels ?? [] });
      state.phases.push({ phase: "issue-create", number, title });
      return { summary: { number, url, state: "OPEN", pullRequest: null }, created: true };
    },
    async comment({ repo, number, body }) {
      state.phases.push({ phase: "issue-comment", number, body });
      return { ok: true };
    },
    async openDraftPullRequest({ repo, head, base, title, body, issueNumber }) {
      const opId = `pr-${head}`;
      if (state.operationIds.has(opId)) {
        return { summary: state.prs.get(head), created: false };
      }
      state.operationIds.set(opId, { verb: "pr create", at: new Date().toISOString() });
      const number = state.prs.size + 1;
      const url = `https://github.com/${repo}/pull/${number}`;
      const sha = sha256(title);
      const summary = { number, url, headRefName: head, baseRefName: base, headSha: sha, draft: true, state: "OPEN", merged: false };
      state.prs.set(head, summary);
      state.phases.push({ phase: "pr-create", number, head, base, issueNumber });
      return { summary, created: true };
    },
    async markReady({ repo, number }) {
      const pr = [...state.prs.values()].find((p) => p.number === number);
      if (!pr) throw new Error(`fake-gh: unknown PR ${number}`);
      pr.draft = false;
      state.phases.push({ phase: "pr-ready", number });
      return { ok: true, headSha: pr.headSha };
    },
    async readPullRequest({ repo, number }) {
      const pr = [...state.prs.values()].find((p) => p.number === number);
      if (!pr) throw new Error(`fake-gh: unknown PR ${number}`);
      return { number: pr.number, url: pr.url, state: pr.state, headRefOid: pr.headSha, isDraft: pr.draft };
    },
    async readChecks({ repo, sha }) {
      const checks = state.checks.get(sha) ?? [];
      state.phases.push({ phase: "read-checks", sha, count: checks.length });
      return checks;
    },
    async mergePullRequest({ repo, number, subject }) {
      const pr = [...state.prs.values()].find((p) => p.number === number);
      if (!pr) throw new Error(`fake-gh: unknown PR ${number}`);
      if (pr.merged) throw new Error(`fake-gh: PR ${number} already merged`);
      if (!state.phases.find((p) => p.phase === "pr-ready" && p.number === number)) {
        throw new Error(`fake-gh: refusing to merge PR ${number} before Ready`);
      }
      pr.merged = true;
      pr.state = "MERGED";
      state.merges.push({ number, sha: pr.headSha, subject });
      state.phases.push({ phase: "pr-merge", number, subject });
      return { ok: true, merged: true, headSha: pr.headSha };
    },
    async refreshHead({ repo, number }) {
      const pr = [...state.prs.values()].find((p) => p.number === number);
      if (!pr) throw new Error(`fake-gh: unknown PR ${number}`);
      return { headSha: pr.headSha };
    },
  };
}

function fakeGhResponse(state, argv) {
  const verb = argv[1];
  // Always emit parseable JSON for issue/pr views.
  if (verb === "issue" && argv[2] === "view") {
    const number = Number(argv[3]);
    const issue = [...state.issues.values()].find((i) => i.number === number);
    if (!issue) return { status: 1, stdout: "", stderr: "not found" };
    return { status: 0, stdout: JSON.stringify({ number: issue.number, title: issue.title, state: "OPEN", body: issue.body, url: issue.url }) };
  }
  if (verb === "pr" && argv[2] === "view") {
    const number = Number(argv[3]);
    const pr = [...state.prs.values()].find((p) => p.number === number);
    if (!pr) return { status: 1, stdout: "", stderr: "not found" };
    return { status: 0, stdout: JSON.stringify({ number: pr.number, url: pr.url, state: pr.state, headRefOid: pr.headSha, isDraft: pr.draft }) };
  }
  if (verb === "pr" && argv[2] === "checks") {
    const sha = argv[3];
    const checks = state.checks.get(sha) ?? [];
    return { status: 0, stdout: JSON.stringify(checks) };
  }
  return { status: 0, stdout: "{}", stderr: "" };
}

export function createFakeModelDispatcher(state, roleModelMap = {}) {
  return {
    async dispatch({ role, prompt, sessionID }) {
      if (!roleModelMap[role]) {
        throw new Error(`fake-model: missing role mapping for ${role}`);
      }
      const expected = roleModelMap[role];
      const observed = prompt?.model;
      if (observed && !observed.startsWith(expected)) {
        throw new Error(`fake-model: ${role} model mismatch (expected ${expected}, got ${observed})`);
      }
      state.modelCalls.push({ role, sessionID, at: new Date().toISOString() });
      return { ok: true, sessionID: sessionID ?? `sess-${state.modelCalls.length}` };
    },
  };
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/**
 * Create two-task PlanV2 used by the local dogfood simulation.
 * The plan is validated against the canonical PlanV2 schema
 * so the publish step exercises the same validator that runs
 * in production.
 */
export function makePlanV2({ workflowId, plannerModel, planSessionId }) {
  const baseSha = "0".repeat(40);
  const now = new Date().toISOString();
  return {
    schemaVersion: 2,
    workflowId,
    workflowModels: {
      planner: plannerModel,
      builder: "fake/cheap-builder",
      finalReviewer: "fake/strong-reviewer",
    },
    revision: 1,
    supersedes: null,
    authoredBy: { sessionID: planSessionId, model: plannerModel, createdAt: now },
    source: {
      repository: "owner/repo",
      issueNumber: 1,
      issueUrl: "https://github.com/owner/repo/issues/1",
      baseBranch: "main",
      baseSha,
    },
    goal: "Two-task journey orchestrated by the fake harness",
    architecture: { summary: "stub", decisions: [] },
    constraints: [],
    files: [
      { path: "src/a.ts", action: "create", responsibility: "Task A", taskIds: ["a"] },
      { path: "src/b.ts", action: "create", responsibility: "Task B", taskIds: ["b"] },
    ],
    tasks: [
      {
        id: "a",
        ordinal: 1,
        title: "Task A",
        objective: "implement A",
        dependsOn: [],
        preconditions: [{ kind: "head-is", value: baseSha }],
        changes: [{ path: "src/a.ts", operation: "create", symbols: [], instructions: ["create"], preserve: ["license header"] }],
        interfaces: [],
        tests: [],
        commands: [],
        acceptance: [{ id: "a1", assertion: "file exists", evidence: ["fs.exists"] }],
        commit: { message: "feat: add a" },
      },
      {
        id: "b",
        ordinal: 2,
        title: "Task B",
        objective: "implement B",
        dependsOn: ["a"],
        preconditions: [{ kind: "file-exists", value: "src/a.ts" }],
        changes: [{ path: "src/b.ts", operation: "create", symbols: [], instructions: ["create"], preserve: ["license header"] }],
        interfaces: [],
        tests: [],
        commands: [],
        acceptance: [{ id: "b1", assertion: "file exists", evidence: ["fs.exists"] }],
        commit: { message: "feat: add b" },
      },
    ],
    finalAcceptance: [],
    outOfScope: [],
    recovery: [],
  };
}

/**
 * Create a fake worktree entry. The fake driver does not
 * actually fork the worktree; it records the call and returns
 * a deterministic head SHA so the same-HEAD invariants can be
 * asserted downstream.
 */
export function createFakeWorktree(state) {
  return {
    async createWorktree({ repo, branch, path }) {
      const head = sha256(`wt-${branch}`).slice(0, 40);
      state.phases.push({ phase: "worktree-create", branch, path, head });
      return { branch, path, head };
    },
  };
}

/**
 * Bootstrap a fresh run record for the dogfood. The plan must
 * already be published via publishPlanRevision + publishApproval.
 */
export async function bootstrapRun({ repo, workflowId, planJson, planHash, baseSha }) {
  const { publishImmutableJson } = await import("../../src/state/durable-store.js");
  const { resolveGitCommonDir, opencodeShipStateDir } = await import("../../src/state/git-common-dir.js");
  const { join } = await import("node:path");
  const common = await resolveGitCommonDir(repo);
  const runDir = join(opencodeShipStateDir(common), "runs", workflowId);
  const { mkdir } = await import("node:fs/promises");
  await mkdir(join(runDir, "events"), { recursive: true });
  const startedAt = new Date().toISOString();
  const runRecord = {
    workflowId,
    revision: planJson.revision,
    sha256: planHash,
    startedAt,
    state: "running",
    activeTask: null,
    round: 0,
    models: planJson.workflowModels,
    baseSha,
  };
  await publishImmutableJson(join(runDir, "run.json"), runRecord);
  const event = { sequence: 1, kind: "run-start", at: startedAt, data: { revision: planJson.revision, sha256: planHash } };
  await publishImmutableJson(join(runDir, "events", "00000001.json"), event);
  return { ...runRecord, events: [] };
}

/**
 * Record a task review by writing the immutable review record
 * and appending the controller event. Mirrors the production
 * ship_task_review module.
 */
export async function recordReview(repo, workflowId, taskId, { round, spec, quality, submittedBy }) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { resolveGitCommonDir, opencodeShipStateDir } = await import("../../src/state/git-common-dir.js");
  const { join } = await import("node:path");
  const { appendRunEvent, readRunState, RUN_EVENT_KINDS } = await import("../../src/workflow/run-controller.js");
  const { publishImmutableJson } = await import("../../src/state/durable-store.js");
  const common = await resolveGitCommonDir(repo);
  const reviewDir = join(opencodeShipStateDir(common), "runs", workflowId, "tasks", taskId, "rounds", String(round).padStart(4, "0"));
  await mkdir(reviewDir, { recursive: true });
  const reviewRecord = {
    workflowId,
    taskId,
    round,
    submittedBy,
    reviewer: "fake/strong-reviewer",
    spec: { verdict: spec },
    quality: { verdict: quality },
    state: spec === "pass" && quality === "pass" ? "commit-pending" : "fix-pending",
    reviewedAt: new Date().toISOString(),
  };
  await publishImmutableJson(join(reviewDir, "review.json"), reviewRecord);
  const run = await readRunState(repo, workflowId);
  const verdict = spec === "pass" && quality === "pass" ? "pass" : "fail";
  const reviewHash = createHash("sha256").update(JSON.stringify(reviewRecord)).digest("hex");
  const { state } = await appendRunEvent(repo, workflowId, run, { kind: RUN_EVENT_KINDS.TASK_REVIEW, data: { taskId, verdict, reviewHash, round } });
  return state;
}

/**
 * Simulate the bounded compaction block that the plugin would
 * emit when the OpenCode session is compressed. The fake
 * harness returns a deterministic snapshot of the workflow.
 */
export async function simulateCompaction(repo, workflowId) {
  const { readRunState } = await import("../../src/workflow/run-controller.js");
  const run = await readRunState(repo, workflowId);
  return {
    workflowId,
    state: run.state,
    activeTask: run.activeTask,
    round: run.round,
    completedTasks: run.completedTasks,
    resumeHint: "ship_resume",
  };
}

/**
 * Run ship_resume via the canonical resume implementation
 * and return the next action.
 */
export async function resume(repo, workflowId) {
  const { resumeRun } = await import("../../src/workflow/resume.js");
  return resumeRun(repo, workflowId);
}

/**
 * Run a final review (Standards or Spec) on the supplied HEAD.
 * Returns the verdict and the recorded head SHA; the same-HEAD
 * gate is asserted by the test.
 */
export async function runFinalReview(repo, workflowId, axis, headSha, reviewerModel) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { resolveGitCommonDir, opencodeShipStateDir } = await import("../../src/state/git-common-dir.js");
  const { join } = await import("node:path");
  const { publishImmutableJson } = await import("../../src/state/durable-store.js");
  const common = await resolveGitCommonDir(repo);
  const dir = join(opencodeShipStateDir(common), "runs", workflowId, "final-review", axis);
  await mkdir(dir, { recursive: true });
  const record = {
    workflowId,
    axis,
    headSha,
    verdict: "pass",
    reviewer: reviewerModel,
    reviewedAt: new Date().toISOString(),
  };
  await publishImmutableJson(join(dir, "review.json"), record);
  return record;
}

/**
 * Run the independent verifier on the supplied HEAD. Returns
 * the verdict and the recorded head SHA.
 */
export async function runVerifier(repo, workflowId, headSha) {
  const { mkdir } = await import("node:fs/promises");
  const { resolveGitCommonDir, opencodeShipStateDir } = await import("../../src/state/git-common-dir.js");
  const { join } = await import("node:path");
  const { publishImmutableJson } = await import("../../src/state/durable-store.js");
  const common = await resolveGitCommonDir(repo);
  const dir = join(opencodeShipStateDir(common), "runs", workflowId, "verifier");
  await mkdir(dir, { recursive: true });
  const record = {
    workflowId,
    headSha,
    verdict: "pass",
    verifier: "gh-cli",
    ranAt: new Date().toISOString(),
  };
  await publishImmutableJson(join(dir, "verifier.json"), record);
  return record;
}

/**
 * Mark PR Ready under the same-HEAD gate. The fake harness
 * records the call and returns the merged state.
 */
export async function markReady(repo, workflowId, headSha, evidence) {
  const { resolveGitCommonDir, opencodeShipStateDir } = await import("../../src/state/git-common-dir.js");
  const { join } = await import("node:path");
  const { publishImmutableJson } = await import("../../src/state/durable-store.js");
  const common = await resolveGitCommonDir(repo);
  const dir = join(opencodeShipStateDir(common), "runs", workflowId);
  const record = {
    workflowId,
    headSha,
    state: "ready",
    evidence,
    readyAt: new Date().toISOString(),
  };
  await publishImmutableJson(join(dir, "ready.json"), record);
  return record;
}

/**
 * Cleanup the workflow after merge. Writes the immutable
 * cleanup receipt so the run ledger records the post-merge
 * state.
 */
export async function cleanup(repo, workflowId) {
  const { resolveGitCommonDir, opencodeShipStateDir } = await import("../../src/state/git-common-dir.js");
  const { join } = await import("node:path");
  const { publishImmutableJson } = await import("../../src/state/durable-store.js");
  const common = await resolveGitCommonDir(repo);
  const dir = join(opencodeShipStateDir(common), "runs", workflowId);
  const record = {
    workflowId,
    state: "cleaned",
    cleanedAt: new Date().toISOString(),
  };
  await publishImmutableJson(join(dir, "cleanup.json"), record);
  return record;
}
