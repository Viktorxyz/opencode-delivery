/*
 * Unit tests for the lightweight JSON-Schema validator used by the
 * installer's config and lock schemas.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { validateSchema } from "../../src/installer/validation.js";
import shipConfigSchema from "../../schema/ship-config.schema.json" with { type: "json" };

test("validateSchema: rejects an unknown root field", () => {
  const out = validateSchema({ schemaVersion: 1, weird: true }, shipConfigSchema);
  assert.equal(out.ok, false);
  assert.ok(out.issues.some((i) => i.includes("unknown field weird")));
});

test("validateSchema: accepts the minimum valid config", () => {
  const out = validateSchema({ schemaVersion: 1 }, shipConfigSchema);
  assert.equal(out.ok, true, JSON.stringify(out.issues));
});

test("validateSchema: rejects an invalid packageManager enum", () => {
  const out = validateSchema({
    schemaVersion: 1,
    project: { packageManager: "deno" },
  }, shipConfigSchema);
  assert.equal(out.ok, false);
  assert.ok(out.issues.some((i) => i.includes("expected one of")));
});

test("validateSchema: enforces minLength on a verification argv item", () => {
  const out = validateSchema({
    schemaVersion: 1,
    delivery: {
      verification: { commands: [{ id: "x", argv: [""] }] },
    },
  }, shipConfigSchema);
  assert.equal(out.ok, false);
});
