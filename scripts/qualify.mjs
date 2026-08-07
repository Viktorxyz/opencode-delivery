#!/usr/bin/env node
/*
 * Release qualification aggregator.
 *
 * Runs the complete set of consumer + workflow gates the plan
 * requires, captures the result of each, and writes a single
 * machine-readable qualification JSON suitable for uploading
 * to a GitHub Release. Every gate binds to the HEAD SHA it
 * ran against, so a regression in any single gate is traceable
 * to the exact commit.
 *
 * Usage: `node scripts/qualify.mjs <repo-root> <head-sha> <out-path>`
 *
 * The script does not require any external services; it shells
 * out to the local Node test runner and reads the result. CI
 * upload is the caller's job.
 */

import { spawnSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { computeRuntimeSourceSha256 } from "./runtime-source-sha.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..");

function hashFile(path) {
  return readFile(path).then((buf) => createHash("sha256").update(buf).digest("hex"));
}

async function runGate(name, argv, cwd) {
  const start = Date.now();
  const r = spawnSync(argv[0], argv.slice(1), { cwd, encoding: "utf8" });
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  return {
    name,
    argv,
    exitCode: r.status ?? -1,
    durationMs: Date.now() - start,
    stdoutLines: stdout.split("\n").length,
    stderrLines: stderr.split("\n").length,
  };
}

async function main() {
  const repoRoot = process.argv[2] ?? REPO;
  const headSha = process.argv[3] ?? "unknown";
  const outPath = process.argv[4] ?? resolve(repoRoot, "dist-pkg", "qualification.json");
  const toolVersion = JSON.parse(await readFile(resolve(REPO, "package.json"), "utf8")).version;
  const nodeVersion = spawnSync("node", ["--version"], { encoding: "utf8" }).stdout.trim();
  const gitVersion = spawnSync("git", ["--version"], { encoding: "utf8" }).stdout.trim();
  const npmVersion = spawnSync("npm", ["--version"], { encoding: "utf8" }).stdout.trim();

  const gates = [
    await runGate("source-verify", ["node", "scripts/verify.mjs"], repoRoot),
  ];

  // Source-grep pins: vendor manifest, lock schema, agent/command
  // catalog, and the plan/compaction/final-review modules.
  const pinPaths = [
    "vendor/sources.json",
    "src/installer/lock.js",
    "src/installer/catalog.js",
    "src/workflow/plan.js",
    "src/workflow/compaction.js",
    "src/workflow/final-review.js",
    "src/installer/root-reconciliation.js",
  ];
  const pins = await Promise.all(
    pinPaths.map(async (rel) => ({ path: rel, sha256: await hashFile(resolve(REPO, rel)) })),
  );

  // Version-independent runtime-source digest; the 1.0 promotion
  // policy uses this to refuse any release whose source bytes
  // differ from the accepted 0.10.0 release.
  const runtimeDigest = await computeRuntimeSourceSha256({ repoRoot: REPO });

  // Tarball digest: the local `npm pack` output.
  const tmpPack = resolve(repoRoot, "dist-pkg");
  await mkdir(tmpPack, { recursive: true });
  const pack = spawnSync("npm", ["pack", "--pack-destination", tmpPack, "--json", "--silent"], {
    cwd: repoRoot, encoding: "utf8",
  });
  let tarball = null;
  if (pack.status === 0) {
    const meta = JSON.parse(pack.stdout);
    const tarballPath = resolve(tmpPack, meta[0].filename);
    tarball = {
      path: tarballPath,
      filename: meta[0].filename,
      sha256: await hashFile(tarballPath),
      size: meta[0].size ?? null,
    };
  }

  const report = {
    schemaVersion: 1,
    producedAt: new Date().toISOString(),
    headSha,
    toolVersion,
    environment: {
      node: nodeVersion,
      git: gitVersion,
      npm: npmVersion,
    },
    runtimeSourceSha256: runtimeDigest.digest,
    runtimeSourceFiles: runtimeDigest.files,
    gates,
    pins,
    tarball,
  };
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  process.stdout.write(`qualify: wrote ${outPath}\n`);
  const failed = gates.filter((g) => g.exitCode !== 0);
  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((e) => { process.stderr.write(`qualify failed: ${e?.message ?? e}\n`); process.exit(2); });
