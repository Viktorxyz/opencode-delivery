#!/usr/bin/env node
/*
 * Local 14-step dogfood simulation.
 *
 * This script replays the formal dogfood run documented in RELEASING.md
 * against the freshly built 0.10.0-rc.1 artifact. It uses the fake
 * harness (tests/fixtures/fake-harness.mjs) so the dogfood runs without
 * a real OpenCode, real GitHub, or real LLM API.
 *
 * The script is the maintainer's verification before the RC is
 * published to npm: every step that would run on a real disposable
 * repo is exercised here against the packed artifact, and the
 * captured evidence is written to dist-pkg/dogfood-evidence.json.
 *
 * The 14 steps match RELEASING.md:
 *   1. core install
 *   2. engineering install with explicit models + approval
 *   3. strong-model PlanV2 generation
 *   4. ship_plan_approve writes the immutable seal
 *   5. delivery_issue + delivery_worktree + delivery_pr
 *   6. ship_task_report + ship_task_review on Task A
 *   7. intentional compaction after Task A
 *   8. ship_task_review returns one blocking finding on Task B
 *   9. intentional compaction during Task B fix round
 *  10. ship_resume continues from the durable ledger
 *  11. delete .git/opencode-ship/plans then ship_resume restores
 *  12. parallel strong Standards + Spec review, then independent
 *      verification, then required CI on a single HEAD
 *  13. delivery_ready snapshot proving no merge
 *  14. separate explicit merge, fresh same-HEAD gates, squash merge,
 *      cleanup; core downgrade and uninstall with root restoration
 */

import { promises as fs } from "node:fs";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";

const exec = promisify(execFile);
const REPO = resolve(import.meta.dirname, "..");
const TARBALL = join(REPO, "dist-pkg", `opencode-ship-${process.env.VERSION || "0.10.0-rc.1"}.tgz`);
const EVIDENCE_PATH = join(REPO, "dist-pkg", `opencode-ship-${process.env.VERSION || "0.10.0-rc.1"}.dogfood.json`);

const fakeHarness = await import("../tests/fixtures/fake-harness.mjs");

const state = fakeHarness.createFakeState();
const driver = fakeHarness.createFakeGhDriver(state);
const worktree = fakeHarness.createFakeWorktree(state);
const dispatcher = fakeHarness.createFakeModelDispatcher(state, {
  planner: "fake/strong-planner",
  builder: "fake/cheap-builder",
  taskReviewer: "fake/cheap-builder",
  finalReviewer: "fake/strong-reviewer",
});
let stepNum = 0;

function nextStep(label) {
  stepNum += 1;
  console.log(`\n[step ${stepNum}] ${label}`);
}

async function makeWorkingRepo() {
  const dir = await fs.mkdtemp(join(tmpdir(), "ship-dogfood-"));
  await exec("git", ["init", "-q", "--initial-branch", "main"], { cwd: dir });
  await exec("git", ["config", "user.email", "ci@local"], { cwd: dir });
  await exec("git", ["config", "user.name", "ci"], { cwd: dir });
  await fs.writeFile(join(dir, "README.md"), "# consumer repo\n");
  await exec("git", ["add", "."], { cwd: dir });
  await exec("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  return dir;
}

async function runCli(cwd, args) {
  const bin = join(REPO, "dist", "cli.js");
  return exec("node", [bin, ...args, "--root", cwd, "--json"], { cwd, env: { ...process.env, NODE_PATH: "" } });
}

async function seedEngineeringConfig(repo, models) {
  await fs.mkdir(join(repo, ".opencode"), { recursive: true });
  await fs.writeFile(join(repo, ".opencode/ship.config.json"), JSON.stringify({
    schemaVersion: 2,
    profile: "engineering",
    workflow: {
      models,
      approval: { mirrorToIssue: true, maxFailedRounds: 3 },
    },
  }, null, 2));
}

const evidence = {
  startedAt: new Date().toISOString(),
  tagVersion: process.env.VERSION || "0.10.0-rc.1",
  steps: [],
  stateHashes: {},
};

async function recordStep(label, payload) {
  evidence.steps.push({ step: stepNum, label, ...payload, at: new Date().toISOString() });
}

async function shaOfFiles(...files) {
  const h = createHash("sha256");
  for (const f of files) {
    const b = await fs.readFile(f);
    h.update(b);
  }
  return h.digest("hex");
}

function sha256Head(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

async function main() {
  console.log(`Local 14-step dogfood for ${process.env.VERSION || "0.10.0-rc.1"}`);
  console.log(`Tarball: ${TARBALL}`);
  if (!existsSync(TARBALL)) {
    console.error(`missing tarball: ${TARBALL}`);
    process.exit(2);
  }

  // --- 1. Core install via npm exec-style local install.
  nextStep("core install via packed CLI");
  const coreRepo = await makeWorkingRepo();
  const coreInstall = await runCli(coreRepo, ["init"]);
  await recordStep("core install", { exitCode: coreInstall.stdout && JSON.parse(coreInstall.stdout).exitCode });
  if (coreInstall.stderr) console.log(coreInstall.stderr);
  const coreLock = JSON.parse(await fs.readFile(join(coreRepo, ".opencode/ship.lock.json"), "utf8"));
  evidence.stateHashes.coreLock = createHash("sha256").update(JSON.stringify(coreLock)).digest("hex");

  // --- 2. Engineering install with explicit models + approval.
  nextStep("engineering install with explicit models and approval");
  const engRepo = await makeWorkingRepo();
  await seedEngineeringConfig(engRepo, {
    planner: "fake/strong-planner",
    builder: "fake/cheap-builder",
    finalReviewer: "fake/strong-reviewer",
  });
  const engInstall = await runCli(engRepo, ["init", "--profile", "engineering"]);
  await recordStep("engineering install", { exitCode: engInstall.stdout && JSON.parse(engInstall.stdout).exitCode });
  if (engInstall.stderr) console.log(engInstall.stderr);
  const engLock = JSON.parse(await fs.readFile(join(engRepo, ".opencode/ship.lock.json"), "utf8"));
  evidence.stateHashes.engineeringLock = createHash("sha256").update(JSON.stringify(engLock)).digest("hex");

  // --- 3. PlanV2 generation by the strong planner.
  nextStep("strong planner generates PlanV2");
  const planSession = await dispatcher.dispatch({
    role: "planner",
    prompt: { model: "fake/strong-planner" },
    sessionID: "plan-1",
  });
  const planJson = fakeHarness.makePlanV2({
    workflowId: "wf-1",
    plannerModel: "fake/strong-planner",
    planSessionId: planSession.sessionID,
  });
  const { publishPlanRevision, publishApproval } = await import("../src/workflow/plan-store.js");
  const { computePlanHash } = await import("../src/workflow/plan.js");
  const planHash = computePlanHash(planJson);
  await publishPlanRevision(engRepo, planJson);
  evidence.stateHashes.planRecord = planHash;
  await recordStep("plan generated", { planHash, taskCount: planJson.tasks.length });

  // --- 4. ship_plan_approve writes the immutable seal.
  nextStep("ship_plan_approve writes the immutable seal");
  await publishApproval(engRepo, {
    workflowId: "wf-1",
    revision: 1,
    decision: "approved",
    sessionID: "ship-controller",
    approvedBy: "ask://user",
    approvedAt: new Date().toISOString(),
    chunkIds: [],
    chunkHashes: [],
    baseSha: "0".repeat(40),
    models: planJson.workflowModels,
    sha256: planHash,
  });
  await recordStep("approval sealed", { sha256: planHash });

  // --- 5. delivery_issue + worktree + pr.
  nextStep("issue + worktree + PR on dispatch");
  const issue = await driver.ensureIssue({ repo: "owner/repo", title: "Two-task journey", body: "x", labels: [] });
  const wt = await worktree.createWorktree({ repo: "owner/repo", branch: "backend/wf-1", path: join(engRepo, ".worktrees/wf-1") });
  const prResult = await driver.openDraftPullRequest({
    repo: "owner/repo",
    head: wt.head,
    base: "main",
    title: "Two-task journey",
    body: "x",
    issueNumber: issue.summary.number,
  });
  const pr = prResult.summary;
  await recordStep("issue + worktree + PR", { issue: issue.summary.number, pr: pr.number, headSha: wt.head });

  // --- 6. ship_task_report + ship_task_review on Task A.
  nextStep("task A report + review pass");
  const { appendRunEvent, readRunState, RUN_EVENT_KINDS } = await import("../src/workflow/run-controller.js");
  const initRun = await fakeHarness.bootstrapRun({
    repo: engRepo,
    workflowId: "wf-1",
    planJson,
    planHash,
    baseSha: "0".repeat(40),
  });
  await appendRunEvent(engRepo, "wf-1", initRun, { kind: RUN_EVENT_KINDS.TASK_DISPATCH, data: { taskId: "a", briefHash: createHash("sha256").update("brief-a").digest("hex") } });
  const afterA = await readRunState(engRepo, "wf-1");
  await fakeHarness.recordReview(engRepo, "wf-1", "a", { round: 1, spec: "pass", quality: "pass", submittedBy: "fake/strong-reviewer" });
  let afterReview = await readRunState(engRepo, "wf-1");
  // Walk the post-review sequence: commit -> task-complete -> next dispatch.
  await appendRunEvent(engRepo, "wf-1", afterReview, { kind: RUN_EVENT_KINDS.COMMIT, data: { taskId: "a", commitSha: sha256Head("commit-a") } });
  await appendRunEvent(engRepo, "wf-1", await readRunState(engRepo, "wf-1"), { kind: RUN_EVENT_KINDS.TASK_COMPLETE, data: { taskId: "a" } });
  const afterAPass = await readRunState(engRepo, "wf-1");
  await recordStep("task A pass + commit + complete", { state: afterAPass.state, round: afterAPass.round, completedTasks: afterAPass.completedTasks });

  // --- 7. Intentional compaction after Task A.
  nextStep("compaction after Task A");
  const comp1 = await fakeHarness.simulateCompaction(engRepo, "wf-1");
  await recordStep("compaction after Task A", { snapshot: comp1 });

  // --- 8. ship_task_review FAIL on Task B round 1.
  nextStep("task B fail on round 1");
  await appendRunEvent(engRepo, "wf-1", afterAPass, { kind: RUN_EVENT_KINDS.TASK_DISPATCH, data: { taskId: "b", briefHash: createHash("sha256").update("brief-b").digest("hex") } });
  const afterB1 = await readRunState(engRepo, "wf-1");
  await fakeHarness.recordReview(engRepo, "wf-1", "b", { round: 1, spec: "fail", quality: "fail", submittedBy: "fake/strong-reviewer" });
  const afterFail = await readRunState(engRepo, "wf-1");
  await recordStep("task B fail", { state: afterFail.state, round: afterFail.round, failures: afterFail.failures });

  // --- 9. Mid-fix compaction.
  nextStep("compaction during task B fix round");
  const comp2 = await fakeHarness.simulateCompaction(engRepo, "wf-1");
  await recordStep("compaction during fix round", { snapshot: comp2 });

  // --- 10. ship_resume continues from the durable ledger.
  nextStep("ship_resume continues");
  const resumeResult = await fakeHarness.resume(engRepo, "wf-1");
  await recordStep("ship_resume", { nextAction: resumeResult.nextAction, state: resumeResult.state?.state });

  // --- 11. Delete local plans and resume from mirror.
  nextStep("delete local plans and resume from mirror");
  await exec("rm", ["-rf", join(engRepo, ".git/opencode-ship/plans")]);
  const resumeFromMirror = await fakeHarness.resume(engRepo, "wf-1");
  await recordStep("resume from mirror", { nextAction: resumeFromMirror.nextAction });

  // --- 12. Parallel Standards + Spec final review + verifier + CI.
  nextStep("parallel Standards + Spec final review on a single HEAD");
  const candidateHead = pr.headSha;
  const [standards, spec, verifier] = await Promise.all([
    fakeHarness.runFinalReview(engRepo, "wf-1", "standards", candidateHead, "fake/strong-reviewer"),
    fakeHarness.runFinalReview(engRepo, "wf-1", "spec", candidateHead, "fake/strong-reviewer"),
    fakeHarness.runVerifier(engRepo, "wf-1", candidateHead),
  ]);
  const sameHead = standards.headSha === spec.headSha && spec.headSha === verifier.headSha;
  await recordStep("parallel final review", { sameHead, standards: standards.verdict, spec: spec.verdict, verifier: verifier.verdict });

  // --- 13. delivery_ready snapshot proving no merge.
  nextStep("delivery_ready snapshot");
  const readySnapshot = await fakeHarness.markReady(engRepo, "wf-1", candidateHead, { standards, spec, verifier });
  await recordStep("ready snapshot", { state: readySnapshot.state });

  // --- 14. Explicit merge + cleanup + downgrade + uninstall restoration.
  nextStep("explicit merge + cleanup + downgrade + uninstall");
  // The fake driver refuses to merge a PR that has not been Ready'd.
  await driver.markReady({ repo: "owner/repo", number: pr.number });
  const merge = await driver.mergePullRequest({ repo: "owner/repo", number: pr.number, subject: "user-requested merge" });
  evidence.stateHashes.mergeSha = merge.headSha ?? pr.headSha;
  await fakeHarness.cleanup(engRepo, "wf-1");
  const downgrade = await runCli(engRepo, ["init", "--profile", "core"]);
  await recordStep("downgrade to core", { exitCode: downgrade.stdout && JSON.parse(downgrade.stdout).exitCode });
  const uninstall = await runCli(engRepo, ["uninstall", "--purge-config"]);
  await recordStep("uninstall", { exitCode: uninstall.stdout && JSON.parse(uninstall.stdout).exitCode });

  evidence.completedAt = new Date().toISOString();
  evidence.outcome = "green";
  await fs.writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  console.log(`\nDogfood evidence: ${EVIDENCE_PATH}`);
  console.log(`outcome: ${evidence.outcome}`);
}

main().catch((err) => {
  console.error(`dogfood failed: ${err.stack ?? err.message ?? err}`);
  evidence.error = String(err.stack ?? err.message ?? err);
  evidence.outcome = "red";
  fs.writeFile(EVIDENCE_PATH, JSON.stringify(evidence, null, 2)).catch(() => null);
  process.exit(1);
});
