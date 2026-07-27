/**
 * delivery doctor.
 *
 * Validates the project adapter, lock file, package pin, OpenCode
 * compatibility, and required CLI tools. Returns a structured report
 * that the parent agent can render without re-parsing free text.
 */

import { access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { ADAPTER_CONTRACT_VERSION, loadAdapter, readLock } from "./adapter.js";

async function fileExists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

function runVersion(argv) {
  const r = spawnSync(argv[0], argv.slice(1), { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (r.status !== 0) return null;
  return r.stdout.trim();
}

export async function doctor(repoRoot, packageVersion) {
  const adapter = await loadAdapter(repoRoot);
  const lock = await readLock(repoRoot);

  const checks = [];

  checks.push({
    name: "node>=20",
    ok: /^v(2[0-9]|[3-9]\d)/.test(process.version),
    detail: process.version,
  });

  const git = runVersion(["git", "--version"]);
  checks.push({
    name: "git installed",
    ok: git !== null,
    detail: git ?? "git not on PATH",
  });

  const gh = runVersion(["gh", "--version"]);
  checks.push({
    name: "gh installed",
    ok: gh !== null,
    detail: gh ?? "gh CLI not on PATH",
  });

  checks.push({
    name: `adapter contract v${ADAPTER_CONTRACT_VERSION}`,
    ok: adapter.ok,
    detail: adapter.ok ? `loaded from ${adapter.path}` : adapter.error.kind,
  });

  if (adapter.ok && lock) {
    checks.push({
      name: "lock sha matches adapter",
      ok: lock.adapterSha256 === adapter.sha256,
      detail: lock.adapterSha256 === adapter.sha256 ? "match" : "drift",
    });
  }

  checks.push({
    name: "package version pinned",
    ok: packageVersion !== null,
    detail: packageVersion ?? "missing",
  });

  return {
    contractVersion: 1,
    adapterPath: adapter.ok ? adapter.path : null,
    adapterSha256: adapter.ok ? adapter.sha256 : null,
    lockPath: lock ? resolve(repoRoot, ".opencode", "delivery.lock.json") : null,
    lockSha256: lock ? lock.adapterSha256 : null,
    packageVersion,
    nodeVersion: process.version,
    ghVersion: gh,
    gitVersion: git,
    checks,
  };
}
