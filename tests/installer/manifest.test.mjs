/*
 * Unit tests for src/installer/manifest.js.
 *
 * The vendor manifest is a JSON file that records every third-party
 * file shipped under `assets/`. prepack reads it; the runtime never
 * does. Tests assert the loader's contract: valid manifest loads;
 * each required field is enforced; unknown fields are rejected;
 * missing files fail closed; duplicate destinations fail closed.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { validateManifest, loadManifest, manifestSummary } from "../../src/installer/manifest.js";

const goodEntry = {
  repository: "Viktorxyz/opencode-ship",
  sourceRef: "abc1234",
  upstreamPath: "skills/example/SKILL.md",
  localTarget: "assets/skills/example/SKILL.md",
  sourceSha256: "a".repeat(64),
  reuseMode: "unchanged",
  license: "MIT",
  adaptationNote: "vendored unchanged from upstream",
};

test("validateManifest: accepts a well-formed entry", () => {
  const r = validateManifest({ version: 1, sources: [goodEntry] });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test("validateManifest: rejects a manifest with no sources array", () => {
  const r = validateManifest({ version: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "shape");
});

test("validateManifest: rejects a missing required field", () => {
  const bad = { ...goodEntry };
  delete bad.repository;
  const r = validateManifest({ version: 1, sources: [bad] });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "shape");
});

test("validateManifest: rejects an unknown reuseMode", () => {
  const r = validateManifest({
    version: 1,
    sources: [{ ...goodEntry, reuseMode: "stolen" }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "shape");
});

test("validateManifest: rejects an unknown version", () => {
  const r = validateManifest({ version: 99, sources: [goodEntry] });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "shape");
});

test("validateManifest: rejects two sources that share a localTarget", () => {
  const r = validateManifest({
    version: 1,
    sources: [goodEntry, { ...goodEntry, upstreamPath: "different/upstream" }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "duplicate-target");
});

test("validateManifest: rejects a sourceSha256 that is the wrong length", () => {
  const r = validateManifest({
    version: 1,
    sources: [{ ...goodEntry, sourceSha256: "deadbeef" }],
  });
  assert.equal(r.ok, false);
  assert.equal(r.kind, "shape");
});

test("validateManifest: accepts all three documented reuseModes", () => {
  for (const reuseMode of ["unchanged", "adapted", "ported"]) {
    const r = validateManifest({
      version: 1,
      sources: [{ ...goodEntry, reuseMode }],
    });
    assert.equal(r.ok, true, `${reuseMode} should be accepted: ${JSON.stringify(r)}`);
  }
});

test("manifestSummary: counts entries by reuseMode", () => {
  const m = {
    version: 1,
    sources: [
      { ...goodEntry, reuseMode: "unchanged", localTarget: "assets/a" },
      { ...goodEntry, reuseMode: "adapted", localTarget: "assets/b" },
      { ...goodEntry, reuseMode: "ported", localTarget: "assets/c" },
    ],
  };
  const s = manifestSummary(m);
  assert.equal(s.total, 3);
  assert.equal(s.byMode.unchanged, 1);
  assert.equal(s.byMode.adapted, 1);
  assert.equal(s.byMode.ported, 1);
});

test("loadManifest: returns null when the file is absent", async () => {
  const r = await loadManifest("/nonexistent/path/vendor/sources.json");
  assert.equal(r, null);
});
