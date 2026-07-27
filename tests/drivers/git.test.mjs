import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

import * as git from "/home/viktorcordas/repos/_bootstrap/opencode-delivery/src/drivers/git.ts";

async function initRepo(dir) {
  const env = { ...process.env, GIT_AUTHOR_NAME: "test", GIT_AUTHOR_EMAIL: "test@local", GIT_COMMITTER_NAME: "test", GIT_COMMITTER_EMAIL: "test@local" };
  spawnSync("git", ["init", "-b", "main"], { cwd: dir, env });
  spawnSync("git", ["config", "user.email", "test@local"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "test"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "# test\n");
  spawnSync("git", ["add", "README.md"], { cwd: dir, env });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir, env });
  return dir;
}

suite("git driver", { concurrency: false }, () => {
test("isInsideWorktree true for a regular repo", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  await initRepo(dir);
  assert.equal(git.isInsideWorktree(dir), true);
  await rm(dir, { recursive: true, force: true });
});

test("isMainCheckout true for the primary checkout", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  await initRepo(dir);
  assert.equal(git.isMainCheckout(dir), true);
  await rm(dir, { recursive: true, force: true });
});

test("listWorktrees returns at least the primary checkout", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  await initRepo(dir);
  const list = git.listWorktrees(dir);
  assert.ok(list.length >= 1);
  assert.equal(list[0].branch, "main");
  await rm(dir, { recursive: true, force: true });
});

test("isWorktreeClean true after init, false after dirty", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  await initRepo(dir);
  assert.equal(git.isWorktreeClean(dir), true);
  await writeFile(join(dir, "dirty"), "x");
  assert.equal(git.isWorktreeClean(dir), false);
  await rm(dir, { recursive: true, force: true });
});

test("currentBranch and currentHead agree after init", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  await initRepo(dir);
  assert.equal(git.currentBranch(dir), "main");
  const head = git.currentHead(dir);
  assert.ok(head);
  assert.equal(head.length, 40);
  await rm(dir, { recursive: true, force: true });
});

test("push refuses unknown remote", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  await initRepo(dir);
  const r = git.push("nope", "main", dir);
  assert.notEqual(r.status, 0);
  await rm(dir, { recursive: true, force: true });
});

test("force-push stub always refuses", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  await initRepo(dir);
  const r = git.pushForceDisabled("origin", "main", dir);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /not permitted/);
  await rm(dir, { recursive: true, force: true });
});

test("mergeIntoFeature on the same base is a no-op", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  await initRepo(dir);
  const r = git.mergeIntoFeature("main", "main", dir);
  assert.equal(r.status, 0);
  await rm(dir, { recursive: true, force: true });
});
});
