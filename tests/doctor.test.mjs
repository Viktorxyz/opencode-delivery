import { test, suite } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { doctor } from "/home/viktorcordas/repos/_bootstrap/opencode-delivery/src/doctor.js";

suite("doctor", { concurrency: false }, () => {
test("doctor requires Node>=20", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  const r = await doctor(dir, "0.1.0");
  assert.equal(r.contractVersion, 1);
  const nodeCheck = r.checks.find((c) => c.name === "node>=20");
  assert.ok(nodeCheck);
  assert.equal(nodeCheck.ok, true);
  await rm(dir, { recursive: true, force: true });
});

test("doctor reports missing adapter cleanly", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  const r = await doctor(dir, "0.1.0");
  const adapterCheck = r.checks.find((c) => c.name.startsWith("adapter contract"));
  assert.ok(adapterCheck);
  assert.equal(adapterCheck.ok, false);
  await rm(dir, { recursive: true, force: true });
});

test("doctor accepts a well-formed adapter", { serial: true }, async () => {
  const dir = await mkdtemp(resolve(tmpdir(), "ocd-test-"));
  const oc = resolve(dir, ".opencode");
  await mkdir(oc, { recursive: true });
  await writeFile(join(oc, "delivery.json"), JSON.stringify({ contractVersion: 1 }));
  const r = await doctor(dir, "0.1.0");
  const adapterCheck = r.checks.find((c) => c.name.startsWith("adapter contract"));
  assert.ok(adapterCheck);
  assert.equal(adapterCheck.ok, true);
  await rm(dir, { recursive: true, force: true });
});

})

