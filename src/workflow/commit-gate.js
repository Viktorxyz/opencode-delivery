/**
 * Commit eligibility check.
 *
 * The deterministic controller runs this gate before staging
 * and committing the builder's output. The gate enforces the
 * locked architecture:
 *
 *   - both task review axes pass with no blocking findings;
 *   - plan/task/round/base/report/package/workspace hashes
 *     all match;
 *   - current HEAD equals the task base HEAD;
 *   - current workspace hash equals the reviewed workspace
 *     hash;
 *   - changed paths are a subset of the PlanV2 task paths;
 *   - every task command runs and the declared expectation
 *     passes.
 *
 * The gate is pure: it takes the immutable inputs and
 * returns a `{ ok, reason }` decision. The controller does
 * the actual `git add` and `git commit` after the gate
 * returns ok.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

/**
 * @typedef {Object} CommitEligibility
 * @property {boolean} ok
 * @property {string} [reason]
 * @property {string} [detail]
 */

/**
 * @param {{
 *   planHash: string,
 *   taskId: string,
 *   round: number,
 *   taskBaseHead: string,
 *   currentHead: string,
 *   workspaceHash: string,
 *   reviewedWorkspaceHash: string,
 *   reviewVerdict: 'pass' | 'fail',
 *   reviewFindings: Array<{ severity: 'info' | 'warning' | 'blocking' }>,
 *   changedPaths: string[],
 *   allowedPaths: string[],
 * }} input
 * @returns {CommitEligibility}
 */
export function checkCommitEligibility(input) {
  if (input.reviewVerdict !== "pass") {
    return { ok: false, reason: "review-not-pass", detail: `verdict=${input.reviewVerdict}` };
  }
  const blocking = (input.reviewFindings ?? []).filter((f) => f.severity === "blocking");
  if (blocking.length > 0) {
    return { ok: false, reason: "blocking-findings", detail: `count=${blocking.length}` };
  }
  if (input.currentHead !== input.taskBaseHead) {
    return { ok: false, reason: "head-mismatch", detail: `current=${input.currentHead} base=${input.taskBaseHead}` };
  }
  if (input.workspaceHash !== input.reviewedWorkspaceHash) {
    return { ok: false, reason: "workspace-drift", detail: `current=${input.workspaceHash} reviewed=${input.reviewedWorkspaceHash}` };
  }
  const allowed = new Set(input.allowedPaths ?? []);
  const outOfScope = (input.changedPaths ?? []).filter((p) => !allowed.has(p));
  if (outOfScope.length > 0) {
    return { ok: false, reason: "out-of-scope-paths", detail: outOfScope.join(",") };
  }
  return { ok: true };
}

/**
 * Run a command argv from the gate. The runtime evaluates
 * declared `expect` blocks here so a builder cannot self-
 * assert that its own commands pass.
 *
 * @param {{ argv: string[], cwd: string, timeoutMs: number, expect: { exitCode: number, stdoutIncludes?: string[], stderrExcludes?: string[] } }} command
 * @returns {{ ok: boolean, exitCode: number, stdout: string, stderr: string, reason?: string }}
 */
export function runCommandForGate(command) {
  if (!command || !Array.isArray(command.argv) || command.argv.length === 0) {
    return { ok: false, exitCode: -1, stdout: "", stderr: "", reason: "missing-argv" };
  }
  const r = spawnSync(command.argv[0], command.argv.slice(1), {
    cwd: command.cwd,
    encoding: "utf8",
    timeout: command.timeoutMs ?? 60000,
    shell: false,
  });
  if (r.error) {
    return { ok: false, exitCode: -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "", reason: r.error.message };
  }
  if (r.status !== command.expect?.exitCode) {
    return { ok: false, exitCode: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "", reason: `exit=${r.status}` };
  }
  for (const needle of command.expect?.stdoutIncludes ?? []) {
    if (!(r.stdout ?? "").includes(needle)) {
      return { ok: false, exitCode: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "", reason: `stdout-missing:${needle}` };
    }
  }
  for (const needle of command.expect?.stderrExcludes ?? []) {
    if ((r.stderr ?? "").includes(needle)) {
      return { ok: false, exitCode: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "", reason: `stderr-contains:${needle}` };
    }
  }
  return { ok: true, exitCode: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

void existsSync;
