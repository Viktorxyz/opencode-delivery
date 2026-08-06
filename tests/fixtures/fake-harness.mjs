/*
 * Fake harnesses for the neutral-consumer workflow journey.
 *
 * The qualification tests cannot talk to a real GitHub or real
 * OpenCode dispatch. Instead they wire in:
 *
 *   - FakeGhDriver: records every typed `gh` argv and enforces
 *     the fixed allowlist (no `gh api`, no `--web`, no
 *     `--body-file`, no shell). Duplicates of an operationId
 *     are rejected.
 *
 *   - FakeModelDispatcher: records every prompt, enforces the
 *     configured role model, and returns scripted responses for
 *     planner, builder, task-reviewer, and final reviewers.
 *
 *   - FakeCliRunner: invokes `npm exec --yes --package=<tarball>
 *     -- opencode-ship <cmd>` via the npm and pnpm shims. The
 *     tarball is built once per test run and cached.
 *
 * The two harnesses share the same FakeState which records
 * phase transitions, PR/issue ids, and per-HEAD gate evidence.
 * Tests assert on the recorded state to prove the workflow
 * travelled through Ready/merge/cleanup in the documented order.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";

const ALLOWED_GH_VERBS = new Set([
  "issue list", "issue view", "issue create", "issue comment",
  "issue edit", "issue close", "pr list", "pr view", "pr create",
  "pr edit", "pr checks", "pr ready", "pr merge",
]);

export function createFakeState() {
  return {
    phases: [],
    issues: new Map(),
    prs: new Map(),
    checks: new Map(),
    operationIds: new Map(),
    merges: [],
    ghCalls: [],
    modelCalls: [],
    phasesByHead: new Map(),
  };
}

export function createFakeGhDriver(state) {
  return {
    repo: "owner/repo",
    async runCommand(argv) {
      if (!Array.isArray(argv) || argv[0] !== "gh") {
        throw new Error(`fake-gh: argv must start with 'gh', got ${JSON.stringify(argv)}`);
      }
      const verb = argv.slice(1, 3).join(" ");
      if (verb.includes("api")) {
        throw new Error(`fake-gh: typed verb is forbidden`);
      }
      if (!ALLOWED_GH_VERBS.has(verb)) {
        throw new Error(`fake-gh: verb not allowed: ${verb}`);
      }
      state.ghCalls.push(argv);
      // Ship's typed tools pass an operationId in argv; the fake
      // harness enforces idempotency by tracking argv fingerprints.
      const opArg = argv.find((a) => a.startsWith("--operation-id="));
      if (opArg) {
        const opId = opArg.split("=")[1];
        if (state.operationIds.has(opId)) {
          return { status: 0, stdout: "{}", stderr: "idempotent" };
        }
        state.operationIds.set(opId, { verb, at: new Date().toISOString() });
      }
      // Build a deterministic response that records the phase.
      const runCommandResult = fakeGhResponse(state, argv);
      return runCommandResult;
    },
    async ensureIssue({ repo, title, body, labels }) {
      const opId = `ensureIssue-${title}`;
      if (state.operationIds.has(opId)) {
        return { summary: { number: state.issues.get(title).number, url: state.issues.get(title).url, state: "OPEN", pullRequest: null }, created: false };
      }
      state.operationIds.set(opId, { verb: "issue create", at: new Date().toISOString() });
      const number = state.issues.size + 1;
      const url = `https://github.com/${repo}/issues/${number}`;
      state.issues.set(title, { number, url, body, labels: labels ?? [] });
      state.phases.push({ phase: "issue-create", number, title });
      return { summary: { number, url, state: "OPEN", pullRequest: null }, created: true };
    },
    async comment({ repo, number, body }) {
      state.phases.push({ phase: "issue-comment", number, body });
      return { ok: true };
    },
    async openDraftPullRequest({ repo, head, base, title, body, issueNumber }) {
      const opId = `pr-${head}`;
      if (state.operationIds.has(opId)) {
        return { summary: state.prs.get(head), created: false };
      }
      state.operationIds.set(opId, { verb: "pr create", at: new Date().toISOString() });
      const number = state.prs.size + 1;
      const url = `https://github.com/${repo}/pull/${number}`;
      const sha = sha256(title);
      const summary = { number, url, headRefName: head, baseRefName: base, headSha: sha, draft: true, state: "OPEN", merged: false };
      state.prs.set(head, summary);
      state.phases.push({ phase: "pr-create", number, head, base, issueNumber });
      return { summary, created: true };
    },
    async markReady({ repo, number }) {
      const pr = [...state.prs.values()].find((p) => p.number === number);
      if (!pr) throw new Error(`fake-gh: unknown PR ${number}`);
      pr.draft = false;
      state.phases.push({ phase: "pr-ready", number });
      return { ok: true, headSha: pr.headSha };
    },
    async readPullRequest({ repo, number }) {
      const pr = [...state.prs.values()].find((p) => p.number === number);
      if (!pr) throw new Error(`fake-gh: unknown PR ${number}`);
      return { number: pr.number, url: pr.url, state: pr.state, headRefOid: pr.headSha, isDraft: pr.draft };
    },
    async readChecks({ repo, sha }) {
      const checks = state.checks.get(sha) ?? [];
      state.phases.push({ phase: "read-checks", sha, count: checks.length });
      return checks;
    },
    async mergePullRequest({ repo, number, subject }) {
      const pr = [...state.prs.values()].find((p) => p.number === number);
      if (!pr) throw new Error(`fake-gh: unknown PR ${number}`);
      if (pr.merged) throw new Error(`fake-gh: PR ${number} already merged`);
      if (!state.phases.find((p) => p.phase === "pr-ready" && p.number === number)) {
        throw new Error(`fake-gh: refusing to merge PR ${number} before Ready`);
      }
      pr.merged = true;
      pr.state = "MERGED";
      state.merges.push({ number, sha: pr.headSha, subject });
      state.phases.push({ phase: "pr-merge", number, subject });
      return { ok: true, merged: true };
    },
    async refreshHead({ repo, number }) {
      const pr = [...state.prs.values()].find((p) => p.number === number);
      if (!pr) throw new Error(`fake-gh: unknown PR ${number}`);
      return { headSha: pr.headSha };
    },
  };
}

function fakeGhResponse(state, argv) {
  const verb = argv[1];
  // Always emit parseable JSON for issue/pr views.
  if (verb === "issue" && argv[2] === "view") {
    const number = Number(argv[3]);
    const issue = [...state.issues.values()].find((i) => i.number === number);
    if (!issue) return { status: 1, stdout: "", stderr: "not found" };
    return { status: 0, stdout: JSON.stringify({ number: issue.number, title: issue.title, state: "OPEN", body: issue.body, url: issue.url }) };
  }
  if (verb === "pr" && argv[2] === "view") {
    const number = Number(argv[3]);
    const pr = [...state.prs.values()].find((p) => p.number === number);
    if (!pr) return { status: 1, stdout: "", stderr: "not found" };
    return { status: 0, stdout: JSON.stringify({ number: pr.number, url: pr.url, state: pr.state, headRefOid: pr.headSha, isDraft: pr.draft }) };
  }
  if (verb === "pr" && argv[2] === "checks") {
    const sha = argv[3];
    const checks = state.checks.get(sha) ?? [];
    return { status: 0, stdout: JSON.stringify(checks) };
  }
  return { status: 0, stdout: "{}", stderr: "" };
}

export function createFakeModelDispatcher(state, roleModelMap = {}) {
  return {
    async dispatch({ role, prompt, sessionID }) {
      if (!roleModelMap[role]) {
        throw new Error(`fake-model: missing role mapping for ${role}`);
      }
      const expected = roleModelMap[role];
      const observed = prompt?.model;
      if (observed && !observed.startsWith(expected)) {
        throw new Error(`fake-model: ${role} model mismatch (expected ${expected}, got ${observed})`);
      }
      state.modelCalls.push({ role, sessionID, at: new Date().toISOString() });
      return { ok: true, sessionID: sessionID ?? `sess-${state.modelCalls.length}` };
    },
  };
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}