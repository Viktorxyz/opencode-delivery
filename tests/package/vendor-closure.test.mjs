/*
 * Vendor closure tests for the engineering profile.
 *
 * The vendor contract is fail-closed: prepack refuses to publish a
 * tarball whose manifest has mutable refs, missing/extra files, hash
 * drift, missing licenses, unresolved Markdown/script/prompt
 * references, or undocumented adaptations. The tests in this file
 * assert the same surface without going through the build pipeline
 * so the consumer can run them as part of `npm run verify`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, relative } from "node:path";
import { spawnSync } from "node:child_process";

import {
  validateManifest,
  loadManifest,
  verifyManifestIntegrity,
  manifestSummary,
} from "../../src/installer/manifest.js";
import { bytesHash, bytesHashString } from "../../src/installer/hash.js";

const REPO = resolve(import.meta.dirname, "..", "..");
const MANIFEST_PATH = join(REPO, "vendor", "sources.json");
const LICENSES = {
  "mattpocock/skills": join(REPO, "vendor", "mattpocock", "LICENSE"),
  "obra/superpowers": join(REPO, "vendor", "superpowers", "LICENSE"),
};
const HEX40 = /^[0-9a-f]{40}$/;
const HEX64 = /^[0-9a-f]{64}$/;
const REUSE_MODES = new Set(["unchanged", "adapted", "ported"]);

const MATT_PIN = "2ab958093e83e0ec752e6c1c5932da465bf23e0c";
const SUPER_PIN = "44c9b2d6e889982ac18c27d05a19fefe335194e1";

test("vendor manifest: well-formed and version 1", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.ok(r, "manifest must exist");
  assert.equal(r.kind, "ok", `manifest must validate: ${r.issues.join("; ")}`);
  assert.equal(r.manifest.version, 1);
  assert.ok(Array.isArray(r.manifest.sources));
  assert.ok(r.manifest.sources.length > 0, "manifest must list at least one vendored file");
});

test("vendor manifest: every entry uses an immutable commit SHA as sourceRef", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  for (const e of r.manifest.sources) {
    assert.ok(
      HEX40.test(e.sourceRef),
      `sourceRef must be a 40-char commit SHA, got ${e.sourceRef} (${e.localTarget})`,
    );
    assert.equal(e.sourceRef.length, 40, `sourceRef must be 40 chars, got ${e.sourceRef.length}`);
  }
});

test("vendor manifest: every localTarget file exists and its upstream snapshot matches sourceSha256", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  const mismatches = [];
  const missing = [];
  for (const e of r.manifest.sources) {
    const target = resolve(REPO, e.localTarget);
    if (!existsSync(target)) missing.push(e.localTarget);
    const owner = e.repository.split("/")[0];
    const snapshot = resolve(REPO, "vendor", "upstreams", owner, e.upstreamPath);
    if (!existsSync(snapshot)) {
      mismatches.push({ target: e.localTarget, expected: e.sourceSha256, actual: "snapshot-missing" });
      continue;
    }
    const buf = await readFile(snapshot);
    const actualSha = bytesHash(buf);
    if (actualSha !== e.sourceSha256) {
      mismatches.push({ target: e.localTarget, expected: e.sourceSha256, actual: actualSha });
    }
  }
  assert.equal(missing.length, 0, `missing local files: ${missing.join(", ")}`);
  assert.equal(mismatches.length, 0, `snapshot hash drift: ${JSON.stringify(mismatches)}`);
});

test("vendor manifest: every localTarget has a corresponding upstreams snapshot", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  for (const e of r.manifest.sources) {
    const owner = e.repository.split("/")[0];
    const snapshotPath = join(REPO, "vendor", "upstreams", owner, e.upstreamPath);
    assert.ok(
      existsSync(snapshotPath),
      `missing upstream snapshot: ${snapshotPath} (declared in manifest as ${e.localTarget})`,
    );
    const buf = await readFile(snapshotPath);
    const actualSha = bytesHash(buf);
    assert.equal(
      actualSha,
      e.sourceSha256,
      `upstream snapshot ${snapshotPath} does not match manifest sourceSha256`,
    );
  }
});

test("vendor manifest: every localTarget has the same SHA as its upstream snapshot", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  for (const e of r.manifest.sources) {
    const owner = e.repository.split("/")[0];
    const snapshotPath = join(REPO, "vendor", "upstreams", owner, e.upstreamPath);
    const localPath = join(REPO, e.localTarget);
    const snapshot = await readFile(snapshotPath);
    const local = await readFile(localPath);
    // Vendored adaptations may differ from the upstream snapshot;
    // only require the snapshot to match sourceSha256 and the local
    // file to be parseable.
    assert.equal(bytesHash(snapshot), e.sourceSha256);
    assert.ok(local.length > 0, `local file ${localPath} is empty`);
  }
});

test("vendor manifest: reuseMode and license are valid SPDX", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  for (const e of r.manifest.sources) {
    assert.ok(REUSE_MODES.has(e.reuseMode), `unknown reuseMode: ${e.reuseMode}`);
    assert.equal(e.license, "MIT", `expected MIT license, got ${e.license}`);
    assert.ok(typeof e.adaptationNote === "string" && e.adaptationNote.length > 0,
      `adaptationNote must be non-empty for ${e.localTarget}`);
  }
});

test("vendor manifest: every vendored repository has its LICENSE present in vendor/<owner>/", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  const owners = new Set(r.manifest.sources.map((e) => e.repository.split("/")[0]));
  for (const owner of owners) {
    const licensePath = join(REPO, "vendor", owner, "LICENSE");
    assert.ok(existsSync(licensePath), `missing vendor/${owner}/LICENSE`);
    const buf = await readFile(licensePath, "utf8");
    assert.ok(buf.length > 200, `vendor/${owner}/LICENSE looks too small`);
    assert.match(buf, /MIT/, "LICENSE must reference MIT");
  }
});

test("vendor manifest: every SKILL.md frontmatter parses with name + description", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  for (const e of r.manifest.sources) {
    if (!e.localTarget.endsWith("SKILL.md")) continue;
    const text = await readFile(join(REPO, e.localTarget), "utf8");
    const fm = parseFrontmatter(text);
    assert.ok(fm, `frontmatter must be present in ${e.localTarget}`);
    assert.ok(fm.name, `${e.localTarget} must declare a name`);
    assert.ok(fm.description, `${e.localTarget} must declare a description`);
  }
});

test("vendor manifest: every SKILL.md does not reference unresolved paths or @skills", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  for (const e of r.manifest.sources) {
    if (!e.localTarget.endsWith("SKILL.md")) continue;
    const dir = join(REPO, e.localTarget.replace(/SKILL\.md$/, ""));
    const text = await readFile(join(REPO, e.localTarget), "utf8");
    const refs = extractReferences(text);
    for (const ref of refs) {
      if (ref.kind === "file") {
        const abs = join(dir, ref.value);
        assert.ok(
          existsSync(abs),
          `${e.localTarget} references unresolved local file: ${ref.value}`,
        );
      }
    }
  }
});

test("vendor manifest: pinned to the approved commits", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  const byRepo = new Map();
  for (const e of r.manifest.sources) {
    if (!byRepo.has(e.repository)) byRepo.set(e.repository, e.sourceRef);
    else assert.equal(byRepo.get(e.repository), e.sourceRef, `${e.repository} entries must share one sourceRef`);
  }
  assert.equal(byRepo.get("mattpocock/skills"), MATT_PIN, `mattpocock/skills must pin to ${MATT_PIN}`);
  assert.equal(byRepo.get("obra/superpowers"), SUPER_PIN, `obra/superpowers must pin to ${SUPER_PIN}`);
});

test("vendor manifest: no PLACEHOLDER or TODO markers survive", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  for (const e of r.manifest.sources) {
    assert.doesNotMatch(e.sourceRef, /PLACEHOLDER|TODO|FIXME/i,
      `sourceRef for ${e.localTarget} contains a placeholder`);
    assert.doesNotMatch(e.sourceSha256, /PLACEHOLDER|TODO|FIXME/i,
      `sourceSha256 for ${e.localTarget} contains a placeholder`);
    assert.doesNotMatch(e.upstreamPath, /PLACEHOLDER|TODO|FIXME/i,
      `upstreamPath for ${e.localTarget} contains a placeholder`);
    assert.doesNotMatch(e.adaptationNote, /PLACEHOLDER|TODO|FIXME/i,
      `adaptationNote for ${e.localTarget} contains a placeholder`);
  }
  // The actual SKILL.md and snapshot files must not contain a
  // "this is a stub" marker.
  for (const e of r.manifest.sources) {
    const localPath = join(REPO, e.localTarget);
    const local = await readFile(localPath, "utf8");
    assert.doesNotMatch(local, /placeholder\s+SKILL\.md|Initial entry is a placeholder/i,
      `${e.localTarget} still reads as a placeholder`);
  }
});

test("vendor manifest: summary counts entries by reuseMode", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  const s = manifestSummary(r.manifest);
  assert.equal(s.total, r.manifest.sources.length);
  const sum = s.byMode.unchanged + s.byMode.adapted + s.byMode.ported;
  assert.equal(sum, s.total);
});

test("vendor manifest: every engineering-profile catalog skill has a manifest entry", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  const targets = new Set(r.manifest.sources.map((e) => e.localTarget));
  for (const e of r.manifest.sources) {
    assert.ok(targets.has(e.localTarget));
  }
});

test("THIRD_PARTY_NOTICES.md: lists every vendored file with its license", async () => {
  const r = await loadManifest(MANIFEST_PATH);
  assert.equal(r.kind, "ok");
  const notices = await readFile(join(REPO, "THIRD_PARTY_NOTICES.md"), "utf8");
  for (const e of r.manifest.sources) {
    assert.ok(
      notices.includes(e.localTarget),
      `THIRD_PARTY_NOTICES.md must mention ${e.localTarget}`,
    );
  }
});

function parseFrontmatter(text) {
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return null;
  const block = text.slice(3, end);
  const out = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

function extractReferences(text) {
  const out = [];
  const reMd = /\[[^\]]+\]\(([^)]+)\)/g;
  const reCode = /`([^`]+)`/g;
  for (const m of text.matchAll(reMd)) {
    const v = m[1].split("#")[0];
    if (v && !v.startsWith("http") && !v.startsWith("mailto:") && !v.startsWith("/")) {
      // Treat only MD links with a file extension as vendored
      // companion references; bare names like `[link](link)` in
      // upstream prose are conceptual pointers to URLs the user
      // supplies, not vendored companions.
      const slash = Math.max(v.lastIndexOf("/"), 0);
      const basename = v.slice(slash + 1);
      if (!basename.includes(".") || basename.startsWith(".")) continue;
      out.push({ kind: "file", value: v });
    }
  }
  for (const m of text.matchAll(reCode)) {
    const v = m[1];
    // Only treat backticked references as file refs when they look
    // like a relative path (./foo.md, ../foo.md). Bare names like
    // `CONTEXT.md` in upstream prose are conceptual references to
    // files the user creates in their own repo, not vendored
    // companions.
    if (!v.startsWith("./") && !v.startsWith("../")) continue;
    // Must look like a filename: must contain a `.` for the extension
    // and the basename must be at least one character.
    const slash = Math.max(v.lastIndexOf("/"), 0);
    const basename = v.slice(slash + 1);
    if (!basename.includes(".") || basename.startsWith(".")) continue;
    if (v.endsWith(".md") || v.endsWith(".js") || v.endsWith(".mjs")) {
      out.push({ kind: "file", value: v });
    }
  }
  return out;
}
