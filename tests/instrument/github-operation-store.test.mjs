/*
 * Tests for the GitHub operation store: idempotency, audit,
 * and resume. The store lives under the resolved Git common
 * directory so main checkouts and linked worktrees share one
 * log.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import {
  hasOperation,
  recordOperation,
  readOperation,
  listOperationIds,
} from "../../src/state/github-operation-store.js";

async function makeRepo() {
  const dir = await mkdtemp(join(tmpdir(), "gho-"));
  const env = { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@local", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@local" };
  spawnSync("git", ["init", "-b", "main"], { cwd: dir, env });
  spawnSync("git", ["config", "user.email", "t@local"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "t"], { cwd: dir });
  await writeFile(join(dir, "README.md"), "# test\n");
  spawnSync("git", ["add", "README.md"], { cwd: dir, env });
  spawnSync("git", ["commit", "-m", "init"], { cwd: dir, env });
  return dir;
}

test("github-operation-store: hasOperation returns false for unknown operation", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  assert.equal(await hasOperation(dir, "op-unknown"), false);
});

test("github-operation-store: recordOperation records and is idempotent", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const first = await recordOperation(dir, "op-1", { kind: "issue-create", ok: true, payload: { number: 7 } });
  assert.equal(first.recorded, true);
  const second = await recordOperation(dir, "op-1", { kind: "issue-create", ok: true, payload: { number: 7 } });
  assert.equal(second.recorded, false, "second record is a no-op");
  const read = await readOperation(dir, "op-1");
  assert.equal(read.operationId, "op-1");
  assert.equal(read.kind, "issue-create");
  assert.equal(read.ok, true);
  assert.equal(read.payload.number, 7);
  assert.ok(typeof read.recordedAt === "string");
});

test("github-operation-store: listOperationIds returns the recorded ids sorted", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await recordOperation(dir, "op-b", { kind: "x", ok: true });
  await recordOperation(dir, "op-a", { kind: "x", ok: true });
  await recordOperation(dir, "op-c", { kind: "x", ok: true });
  const ids = await listOperationIds(dir);
  assert.deepEqual(ids, ["op-a", "op-b", "op-c"]);
});

test("github-operation-store: readOperation returns null for missing", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  const v = await readOperation(dir, "op-missing");
  assert.equal(v, null);
});

test("github-operation-store: rejects empty operationId", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await assert.rejects(() => recordOperation(dir, "", { kind: "x", ok: true }), /operationId must be a non-empty string/);
});

test("github-operation-store: rejects non-object record", async (t) => {
  const dir = await makeRepo();
  t.after(async () => rm(dir, { recursive: true, force: true }));
  await assert.rejects(() => recordOperation(dir, "op-1", null), /record must be an object/);
});
