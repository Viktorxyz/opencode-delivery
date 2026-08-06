/*
 * Task review and workspace manifest tests.
 *
 * The task reviewer's verdict is the gate between the
 * builder and the controller's commit. The workspace
 * manifest is the controller's view of the worktree.
 * Together they bind the commit to one (plan, task, round,
 * workspace) tuple.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  validateTaskReviewVerdict,
  hashVerdict,
} from "../../src/workflow/task-review.js";
import {
  captureWorkspaceManifest,
  manifestPaths,
  assertManifestInScope,
  filterManifestToPaths,
} from "../../src/workflow/workspace.js";

const HEX64 = /^[0-9a-f]{64}$/;

function validVerdict(overrides = {}) {
  return {
    planHash: "a".repeat(64),
    taskId: "t1",
    round: 1,
    workspaceHash: "b".repeat(64),
    verdict: "pass",
    findings: [],
    reviewerSessionID: "session-1",
    reviewerModel: "minimax/MiniMax-M3",
    reviewedAt: new Date().toISOString(),
    ...overrides,
  };
}

test("task-review: a well-formed verdict validates", () => {
  const r = validateTaskReviewVerdict(validVerdict());
  assert.equal(r.ok, true);
});

test("task-review: verdict=pass with a blocking finding is rejected", () => {
  const v = validVerdict({
    verdict: "pass",
    findings: [{ axis: "spec", severity: "blocking", message: "missing acceptance" }],
  });
  const r = validateTaskReviewVerdict(v);
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.includes("blocking finding")));
});

test("task-review: verdict=fail with blocking findings is allowed", () => {
  const v = validVerdict({
    verdict: "fail",
    findings: [
      { axis: "spec", severity: "blocking", message: "missing acceptance" },
      { axis: "quality", severity: "warning", message: "style nits" },
    ],
  });
  const r = validateTaskReviewVerdict(v);
  assert.equal(r.ok, true);
});

test("task-review: planHash must be a 64-char hex", () => {
  const r = validateTaskReviewVerdict(validVerdict({ planHash: "short" }));
  assert.equal(r.ok, false);
});

test("task-review: reviewerModel must be <provider>/<model>", () => {
  const r = validateTaskReviewVerdict(validVerdict({ reviewerModel: "model-only" }));
  assert.equal(r.ok, false);
});

test("task-review: round must be a positive integer", () => {
  const r = validateTaskReviewVerdict(validVerdict({ round: 0 }));
  assert.equal(r.ok, false);
});

test("task-review: hashVerdict is stable and 64-char hex", () => {
  const v = validVerdict();
  const h1 = hashVerdict(v);
  const h2 = hashVerdict({ ...v });
  assert.match(h1, HEX64);
  assert.equal(h1, h2);
});

test("task-review: hashVerdict changes when any field changes", () => {
  const v1 = validVerdict();
  const v2 = validVerdict({ verdict: "fail" });
  assert.notEqual(hashVerdict(v1), hashVerdict(v2));
});

async function makeRepo() {
  const dir = await mkdtemp(join(tmpdir(), "ws-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@local", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@local" };
  spawnSync("git", ["init", "-b", "main"], { cwd: dir, env });
  spawnSync("git", ["config", "user.email", "t@local"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "# t\n");
  spawnSync("git", ["add", "README.md"], { cwd: dir, env });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir, env });
  return dir;
}

test("workspace: manifestPaths returns every changed path", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "added.txt"), "new\n");
  await writeFile(join(dir, "README.md"), "modified\n");
  const m = await captureWorkspaceManifest(dir);
  const paths = manifestPaths(m);
  assert.ok(paths.has("added.txt"));
  assert.ok(paths.has("README.md"));
});

test("workspace: assertManifestInScope flags out-of-scope paths", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "added.txt"), "new\n");
  const m = await captureWorkspaceManifest(dir);
  const r = assertManifestInScope(m, []);
  assert.equal(r.ok, false);
  assert.deepEqual(r.outOfScope, ["added.txt"]);
});

test("workspace: filterManifestToPaths returns only the allowed entries", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "added.txt"), "new\n");
  await writeFile(join(dir, "other.txt"), "x\n");
  const m = await captureWorkspaceManifest(dir);
  const filtered = filterManifestToPaths(m, ["added.txt"]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].path, "added.txt");
});

test("workspace: deleted entries are tracked without bytes", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, "to-delete.txt"), "bye\n");
  spawnSync("git", ["-C", dir, "add", "to-delete.txt"]);
  spawnSync("git", ["-C", dir, "commit", "-m", "add"]);
  spawnSync("git", ["-C", dir, "rm", "to-delete.txt"]);
  const m = await captureWorkspaceManifest(dir);
  const deleted = m.entries.find((e) => e.path === "to-delete.txt");
  assert.ok(deleted, "to-delete.txt should appear in the manifest");
  assert.equal(deleted.status, "deleted");
  assert.equal(deleted.sha256, undefined);
});

test("workspace: manifest hash changes when entries change", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const m1 = await captureWorkspaceManifest(dir);
  await writeFile(join(dir, "new.txt"), "x\n");
  const m2 = await captureWorkspaceManifest(dir);
  assert.notEqual(m1.hash, m2.hash);
});
