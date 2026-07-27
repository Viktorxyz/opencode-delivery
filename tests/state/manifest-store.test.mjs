import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

import { listManifests, readManifest, writeManifest, deleteManifest } from "../../src/state/manifest-store.js";
import { createManifest } from "../../src/state/lifecycle.js";

async function makeBareRepo() {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@local", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@local" };
  spawnSync("git", ["init", "-b", "main"], { cwd: dir, env });
  spawnSync("git", ["config", "user.email", "test@local"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "test"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "# test\n");
  spawnSync("git", ["add", "README.md"], { cwd: dir, env });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir, env });
  return dir;
}

suite("manifest store", { concurrency: false }, () => {
test("writeManifest/readManifest round-trip under git-common-dir", { serial: true }, async () => {
  const dir = await makeBareRepo();
  const m = createManifest({
    taskId: "task-99",
    repoIdentity: "owner/repo",
    issueNumber: 1,
    baseBranch: "main",
    baseSha: "abc",
    branch: "owner/issue-1",
    owner: "opencode-build",
  });
  const path = await writeManifest(dir, m);
  assert.ok(path.includes("opencode-delivery/manifests/task-99.json"));
  const back = await readManifest(dir, "task-99");
  assert.ok(back);
  assert.equal(back.taskId, "task-99");
  await rm(dir, { recursive: true, force: true });
});

test("readManifest returns null for missing manifest", { serial: true }, async () => {
  const dir = await makeBareRepo();
  const back = await readManifest(dir, "missing");
  assert.equal(back, null);
  await rm(dir, { recursive: true, force: true });
});

test("listManifests survives an empty directory", { serial: true }, async () => {
  const dir = await makeBareRepo();
  const list = await listManifests(dir);
  assert.deepEqual(list, []);
  await rm(dir, { recursive: true, force: true });
});

test("listManifests returns every manifest in the directory", { serial: true }, async () => {
  const dir = await makeBareRepo();
  await writeManifest(dir, createManifest({
    taskId: "a", repoIdentity: "owner/repo", issueNumber: 1, baseBranch: "main", baseSha: "abc", branch: "owner/a", owner: "x",
  }));
  await writeManifest(dir, createManifest({
    taskId: "b", repoIdentity: "owner/repo", issueNumber: 2, baseBranch: "main", baseSha: "abc", branch: "owner/b", owner: "x",
  }));
  const list = await listManifests(dir);
  assert.equal(list.length, 2);
  const ids = list.map((m) => m.taskId).sort();
  assert.deepEqual(ids, ["a", "b"]);
  await rm(dir, { recursive: true, force: true });
});

test("deleteManifest removes the manifest file", { serial: true }, async () => {
  const dir = await makeBareRepo();
  await writeManifest(dir, createManifest({
    taskId: "task-rm", repoIdentity: "owner/repo", issueNumber: 1, baseBranch: "main", baseSha: "abc", branch: "owner/issue-1", owner: "opencode-build",
  }));
  await deleteManifest(dir, "task-rm");
  const back = await readManifest(dir, "task-rm");
  assert.equal(back, null);
  await rm(dir, { recursive: true, force: true });
});

test("writeManifest is atomic (no .tmp remains)", { serial: true }, async () => {
  const dir = await makeBareRepo();
  const m = createManifest({
    taskId: "task-atom",
    repoIdentity: "owner/repo",
    issueNumber: 1,
    baseBranch: "main",
    baseSha: "abc",
    branch: "owner/issue-1",
    owner: "opencode-build",
  });
  await writeManifest(dir, m);
  const fs = await import("node:fs/promises");
  const manifestsDir = resolve(dir, ".git", "opencode-delivery", "manifests");
  const files = await fs.readdir(manifestsDir);
  assert.ok(files.some((f) => f === "task-atom.json"));
  assert.ok(!files.some((f) => f.endsWith(".tmp")), `unexpected .tmp file: ${files.join(", ")}`);
  await rm(dir, { recursive: true, force: true });
});
});
