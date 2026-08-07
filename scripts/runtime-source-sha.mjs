#!/usr/bin/env node
/*
 * Runtime-source digest for opencode-ship.
 *
 * The plan requires `1.0.0` to be byte-equivalent to the accepted
 * `0.10.0` runtime. Because `1.0.0` only changes the version field
 * (and documentation/release metadata), comparing the two source
 * SHAs cannot work — the SHAs differ by construction. The replacement
 * rule compares a `runtimeSourceSha256` digest that:
 *
 *   - includes every file that can change runtime behaviour:
 *       src/**, assets/**, schema/**, vendor/**,
 *       scripts/build.mjs, scripts/prepack.mjs
 *   - includes a normalised package.json with the top-level `version`
 *     field removed (so `bin`, `exports`, `files`, `engines`,
 *     `publishConfig`, `peerDependencies` still participate in the
 *     digest; bumping `version` alone cannot change it);
 *   - excludes generated output (dist/**, .tmp/**), the lockfile
 *     version (package-lock.json), README, CHANGELOG, and release
 *     metadata (RELEASING.md, THIRD_PARTY_NOTICES.md, LICENSE,
 *     docs/**);
 *   - sorts paths in byte order and hashes a canonical
 *     `<relpath>\0<sha256hex>` stream.
 *
 * The digest is therefore a pure function of the runtime source. Two
 * commits that only touch `package.json#version`, the README, the
 * CHANGELOG, the lockfile, or release metadata produce the same
 * digest; any other change flips at least one byte and the digest
 * changes.
 *
 * The script returns the lowercase hex digest. It also exposes the
 * file list so the qualification report can show what was hashed.
 */

import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO = resolve(__dirname, "..");

function isMainEntry() {
  if (!process.argv[1]) return false;
  try {
    const invoked = resolve(process.argv[1]);
    const here = fileURLToPath(import.meta.url);
    return invoked === here;
  } catch {
    return false;
  }
}

export const RUNTIME_INCLUDE_DIRS = Object.freeze([
  "src",
  "assets",
  "schema",
  "vendor",
]);

export const RUNTIME_INCLUDE_FILES = Object.freeze([
  "scripts/build.mjs",
  "scripts/prepack.mjs",
  "package.json",
]);

export const RUNTIME_EXCLUDE_TOP_LEVEL = Object.freeze(new Set([
  // Generated artefacts and release metadata that must not shift
  // the digest across `0.10.0` / `1.0.0` / docs-only commits.
  "dist",
  ".tmp",
  "node_modules",
  ".git",
  "package-lock.json",
  "README.md",
  "CHANGELOG.md",
  "RELEASING.md",
  "THIRD_PARTY_NOTICES.md",
  "LICENSE",
  "docs",
  ".opencode", // contributor-local state; never part of the runtime
  ".worktrees",
  "dist-pkg",
  "dist-pkg.prev",
  "dist.prev",
  ".fallow",
]));

function normalisePackageJson(raw) {
  const parsed = JSON.parse(raw);
  // The version field is the only field allowed to change between
  // 0.10.0 and 1.0.0. Strip it before re-stringifying so the digest
  // ignores it; preserve every other field exactly.
  if (Object.prototype.hasOwnProperty.call(parsed, "version")) {
    delete parsed.version;
  }
  // Stable key order is provided by JSON.stringify itself, which
  // iterates own enumerable string-keyed properties in insertion
  // order. The package.json fields are inserted in the order they
  // appear on disk (load → delete → stringify), so the output is
  // deterministic as long as the file's top-level field order does
  // not change between runs.
  return JSON.stringify(parsed, null, 2) + "\n";
}

async function listFiles(root, rel) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return [];
  const out = [];
  const stack = [rel];
  while (stack.length > 0) {
    const current = stack.pop();
    const curAbs = join(root, current);
    let st;
    try {
      st = await stat(curAbs);
    } catch (e) {
      if (e?.code === "ENOENT") continue;
      throw e;
    }
    if (st.isDirectory()) {
      const entries = await readdir(curAbs, { withFileTypes: true });
      for (const e of entries) {
        stack.push(join(current, e.name));
      }
      continue;
    }
    if (st.isFile()) {
      out.push({ relPath: current.replaceAll(sep, "/"), bytes: await readFile(curAbs) });
    }
  }
  return out;
}

/**
 * Compute the runtime-source digest and the list of included files.
 *
 * @param {object} [opts]
 * @param {string} [opts.repoRoot] Absolute path to the package root.
 * @returns {Promise<{ digest: string, files: { path: string, sha256: string }[], fileCount: number }>}
 */
export async function computeRuntimeSourceSha256({ repoRoot = DEFAULT_REPO } = {}) {
  const entries = [];
  for (const dir of RUNTIME_INCLUDE_DIRS) {
    const found = await listFiles(repoRoot, dir);
    for (const f of found) {
      // Skip the top-level excludes that happen to live inside an
      // include directory (currently none, but the guard keeps the
      // contract stable when a future contributor adds `vendor/.git`
      // or similar).
      const top = f.relPath.split("/")[0];
      if (RUNTIME_EXCLUDE_TOP_LEVEL.has(top)) continue;
      entries.push(f);
    }
  }
  for (const file of RUNTIME_INCLUDE_FILES) {
    const abs = join(repoRoot, file);
    if (!existsSync(abs)) continue;
    let bytes;
    if (file === "package.json") {
      bytes = Buffer.from(normalisePackageJson(await readFile(abs, "utf8")), "utf8");
    } else {
      bytes = await readFile(abs);
    }
    entries.push({ relPath: file, bytes });
  }

  // Stable, byte-order sort on relative paths.
  entries.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));

  const hash = createHash("sha256");
  const fileDigests = [];
  for (const entry of entries) {
    const fileSha = createHash("sha256").update(entry.bytes).digest("hex");
    fileDigests.push({ path: entry.relPath, sha256: fileSha });
    // Canonical stream: <path>\0<sha256>\n. The newline is purely a
    // delimiter between entries; the \0 inside the path is impossible
    // because every entry comes from a real file path on disk.
    hash.update(entry.relPath);
    hash.update("\0");
    hash.update(fileSha);
    hash.update("\n");
  }
  return { digest: hash.digest("hex"), files: fileDigests, fileCount: fileDigests.length };
}

if (isMainEntry()) {
  // Parse argv manually so flag-like positional arguments
  // (`--json`) do not collide with the optional repo-root
  // argument. Only the first non-flag positional is treated as
  // the repo root; `--json` selects the JSON output shape.
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const positional = args.filter((a) => a !== "--json");
  const repoRoot = positional[0] ?? DEFAULT_REPO;
  const r = await computeRuntimeSourceSha256({ repoRoot });
  if (json) {
    process.stdout.write(JSON.stringify({ digest: r.digest, fileCount: r.fileCount, files: r.files }, null, 2) + "\n");
  } else {
    process.stdout.write(r.digest + "\n");
  }
}
