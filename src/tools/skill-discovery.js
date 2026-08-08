/*
 * Skill discovery tools.
 *
 * Thin wrappers over the `npx skills` CLI from the open agent
 * skills ecosystem. Used by the ship-controller during
 * `ship-deliver` to auto-discover relevant public skills for the
 * current task.
 *
 * The auto-install policy is enforced in the wrapper itself so the
 * skill cannot bypass it: the controller never invokes
 * `npx skills add` directly; it goes through `ship_skill_install`
 * which checks the trusted-owner allowlist and install-count
 * threshold from `ship.config.json` and the deny-block list.
 *
 * Dynamic skills land in `.opencode/skills/<skill>/SKILL.md` of
 * the consumer repo and are recorded in the run ledger so
 * `opencode-ship doctor` and `opencode-ship uninstall` can audit
 * them.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DEFAULT_TRUSTED_OWNERS = Object.freeze([
  "vercel-labs",
  "anthropics",
  "obra",
  "mattpocock",
  "ComposioHQ",
]);

const DEFAULT_MIN_INSTALLS = 1000;
const MAX_TRUSTED_PER_RUN = 5;

function runCapture(cmd, args, options) {
  const cwd = options?.cwd;
  const timeoutMs = options?.timeoutMs ?? 30000;
  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, args, { cwd, shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      rejectP(new Error(`skill-discovery: timeout running '${cmd} ${args.join(" ")}'`));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
    child.on("error", (err) => { clearTimeout(timer); rejectP(err); });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolveP({ code, stdout, stderr });
    });
  });
}

function readShipConfig(repoRoot) {
  const path = join(repoRoot, ".opencode", "ship.config.json");
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return {};
  }
}

function resolvePolicy(repoRoot) {
  const config = readShipConfig(repoRoot);
  const discovery = config.skillDiscovery ?? {};
  return {
    trustedOwners: Array.isArray(discovery.trustedOwners) && discovery.trustedOwners.length
      ? discovery.trustedOwners
      : [...DEFAULT_TRUSTED_OWNERS],
    minInstalls: Number.isInteger(discovery.minInstalls) ? discovery.minInstalls : DEFAULT_MIN_INSTALLS,
    blocklist: Array.isArray(discovery.blocklist) ? discovery.blocklist : [],
  };
}

function parseFindOutput(text) {
  const lines = text.split(/\r?\n/);
  const candidates = [];
  for (const line of lines) {
    const match = line.match(/^\s*([a-zA-Z0-9_.\-]+)\s+([a-zA-Z0-9_.\-/]+)\s+([0-9]+)\s*$/);
    if (!match) continue;
    candidates.push({
      skill: match[1],
      package: match[2],
      installs: Number.parseInt(match[3], 10),
    });
  }
  return candidates;
}

/**
 * Run `npx skills find <query>` against the consumer repo and
 * return the parsed candidate list. Never installs anything.
 */
export async function discoverSkills({ repoRoot, query }) {
  if (!repoRoot || !query) {
    return { ok: false, error: { kind: "missing-args" } };
  }
  const r = await runCapture("npx", ["skills", "find", query], { cwd: repoRoot, timeoutMs: 60000 });
  if (r.code !== 0 && !r.stdout.trim()) {
    return { ok: false, error: { kind: "registry-unavailable", stderr: r.stderr } };
  }
  const candidates = parseFindOutput(r.stdout);
  return { ok: true, candidates, raw: r.stdout };
}

/**
 * Filter the candidate list through the trusted-owner allowlist
 * and the install-count threshold. Returns the auto-approved
 * subset and the list of candidates that need explicit user
 * approval.
 */
export function partitionCandidates(candidates, policy) {
  const auto = [];
  const needsApproval = [];
  for (const c of candidates) {
    if (policy.blocklist.includes(c.package)) continue;
    const owner = c.package.split("/")[0];
    const isTrusted = policy.trustedOwners.includes(owner);
    const countOk = c.installs >= policy.minInstalls;
    if (isTrusted && countOk) {
      if (auto.length < MAX_TRUSTED_PER_RUN) auto.push(c);
      else needsApproval.push(c);
    } else {
      needsApproval.push(c);
    }
  }
  return { auto, needsApproval };
}

/**
 * Install a single skill into the consumer repo at
 * `.opencode/skills/<skill>/SKILL.md`. Caller is responsible for
 * filtering through the policy; this function only enforces the
 * allowlist, the install-count threshold, and the shadow check
 * against the bundled opencode-ship catalog.
 */
export async function installSkill({ repoRoot, candidate, policy, catalogSkillNames }) {
  if (!repoRoot || !candidate) {
    return { ok: false, error: { kind: "missing-args" } };
  }
  if (policy.blocklist.includes(candidate.package)) {
    return { ok: false, error: { kind: "blocked" } };
  }
  const owner = candidate.package.split("/")[0];
  if (!policy.trustedOwners.includes(owner)) {
    return { ok: false, error: { kind: "untrusted-owner" } };
  }
  if (candidate.installs < policy.minInstalls) {
    return { ok: false, error: { kind: "below-threshold" } };
  }
  if (Array.isArray(catalogSkillNames) && catalogSkillNames.includes(candidate.skill)) {
    return { ok: false, error: { kind: "shadows-managed-skill" } };
  }
  const r = await runCapture("npx", ["skills", "add", candidate.package, "-y"], { cwd: repoRoot, timeoutMs: 120000 });
  if (r.code !== 0) {
    return { ok: false, error: { kind: "install-failed", stderr: r.stderr } };
  }
  return { ok: true, package: candidate.package, skill: candidate.skill, raw: r.stdout };
}

/**
 * High-level helper: run discovery, partition, auto-install the
 * trusted subset, and return both the installed list and the
 * pending-approval list. The controller logs the pending list to
 * the user.
 */
export async function discoverAndInstall({ repoRoot, query, catalogSkillNames = [] }) {
  const policy = resolvePolicy(repoRoot);
  const discovered = await discoverSkills({ repoRoot, query });
  if (!discovered.ok) return discovered;
  const partition = partitionCandidates(discovered.candidates, policy);
  const installed = [];
  const failed = [];
  for (const c of partition.auto) {
    const result = await installSkill({ repoRoot, candidate: c, policy, catalogSkillNames });
    if (result.ok) installed.push(c);
    else failed.push({ candidate: c, error: result.error });
  }
  return {
    ok: true,
    installed,
    needsApproval: partition.needsApproval,
    failed,
    raw: discovered.raw,
  };
}

/**
 * Records a dynamic-skill install in the run ledger. This is a
 * thin JSONL file under `<git-common-dir>/opencode-ship/runs/` that
 * the doctor and uninstall audit.
 */
export function recordInstall({ repoRoot, packageId, skill, runId, source = "skills.sh" }) {
  const commonDir = resolve(repoRoot, ".git");
  if (!existsSync(commonDir)) return;
  const dir = join(commonDir, "opencode-ship", "runs", runId ?? "default");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "dynamic-skills.jsonl");
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    source,
    package: packageId,
    skill,
  });
  if (existsSync(path)) {
    const existing = readFileSync(path, "utf8");
    writeFileSync(path, existing + line + "\n", "utf8");
  } else {
    writeFileSync(path, line + "\n", "utf8");
  }
}
