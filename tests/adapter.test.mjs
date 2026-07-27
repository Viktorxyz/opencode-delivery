import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

import { loadAdapter, validateAdapter, writeLock, readLock, ADAPTER_CONTRACT_VERSION } from "../src/adapter.js";

const minimal = { contractVersion: 1 };

suite("adapter", { concurrency: false }, () => {
test("validateAdapter accepts the minimal contract", { serial: true }, () => {
  const r = validateAdapter(minimal);
  assert.equal(r.ok, true);
  assert.equal(ADAPTER_CONTRACT_VERSION, 1);
});

test("validateAdapter rejects unknown root keys", { serial: true }, () => {
  const r = validateAdapter({ ...minimal, mystery: true });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.issues.some((i) => i.includes("mystery")));
});

test("validateAdapter rejects wrong contract version", { serial: true }, () => {
  const r = validateAdapter({ contractVersion: 2 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.issues.some((i) => i.includes("contractVersion")));
});

test("validateAdapter rejects unknown forge fields", { serial: true }, () => {
  const r = validateAdapter({ ...minimal, forge: { driver: "github", wrong: true } });
  assert.equal(r.ok, false);
});

test("validateAdapter accepts squash merge + explicit policy", { serial: true }, () => {
  const r = validateAdapter({ ...minimal, merge: { strategy: "squash", policy: "explicit-user-request-only" } });
  assert.equal(r.ok, true);
});

test("validateAdapter rejects non-squash merge", { serial: true }, () => {
  const r = validateAdapter({ ...minimal, merge: { strategy: "merge-commit" } });
  assert.equal(r.ok, false);
});

test("validateAdapter accepts a populated verification block", { serial: true }, () => {
  const r = validateAdapter({ ...minimal, verification: { commands: [{ id: "ci", argv: ["echo", "ok"] }] } });
  assert.equal(r.ok, true);
});

test("validateAdapter rejects a verification block with bad argv", { serial: true }, () => {
  const r = validateAdapter({ ...minimal, verification: { commands: [{ id: "ci", argv: "echo ok" }] } });
  assert.equal(r.ok, false);
});

test("validateAdapter rejects unknown worktree keys", { serial: true }, () => {
  const r = validateAdapter({ ...minimal, worktree: { root: ".worktrees", madeUp: true } });
  assert.equal(r.ok, false);
});

test("loadAdapter returns missing on absent file", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  const r = await loadAdapter(dir);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.kind, "missing");
  await rm(dir, { recursive: true, force: true });
});

test("loadAdapter returns parse error on malformed JSON", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  const oc = resolve(dir, ".opencode");
  await mkdir(oc, { recursive: true });
  await writeFile(join(oc, "delivery.json"), "{ this is not json");
  const r = await loadAdapter(dir);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.kind, "parse");
  await rm(dir, { recursive: true, force: true });
});

test("loadAdapter returns contract error on bad shape", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  const oc = resolve(dir, ".opencode");
  await mkdir(oc, { recursive: true });
  await writeFile(join(oc, "delivery.json"), JSON.stringify({ contractVersion: 2 }));
  const r = await loadAdapter(dir);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.kind, "contract");
  await rm(dir, { recursive: true, force: true });
});

test("loadAdapter round-trips through writeLock / readLock", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  const oc = resolve(dir, ".opencode");
  await mkdir(oc, { recursive: true });
  await writeFile(join(oc, "delivery.json"), JSON.stringify({ contractVersion: 1 }));
  const r = await loadAdapter(dir);
  assert.equal(r.ok, true);
  if (r.ok) {
    await writeLock(dir, r.sha256);
    const back = await readLock(dir);
    assert.ok(back);
    assert.equal(back.adapterSha256, r.sha256);
  }
  await rm(dir, { recursive: true, force: true });
});

})

