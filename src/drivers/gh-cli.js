/**
 * Production GitHub driver backed by the GitHub CLI.
 *
 * Every command is `spawn(gh, argv)` with `shell:false`. There is no
 * `gh api *` shortcut used here on purpose: a `gh api` permission ask
 * rule would let the agent bypass the driver's merge-gate checks. By
 * using only typed CLI verbs we keep the surface narrow and auditable.
 */

import { spawn } from "node:child_process";

function run(args, opts) {
  opts = opts ?? {};
  return new Promise((resolve, reject) => {
    const proc = spawn("gh", args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", reject);
    proc.on("close", (status) => resolve({ stdout, stderr, status: status ?? -1 }));
  });
}

async function ghJson(args, opts) {
  const r = await run(args, opts);
  if (r.status !== 0) {
    throw new Error(`gh ${args.join(" ")} failed: ${r.stderr.trim()}`);
  }
  return JSON.parse(r.stdout);
}

function pullRequestSummaryFromView(fields) {
  return {
    number,
    url,
    baseRefName,
    headRefName,
    headSha: input.headSha,
    draft,
    mergeable: fields.mergeable ?? "UNKNOWN",
    mergeStateStatus,
    merged,
    mergedAt,
  };
}

export function createGhDriver() {
  return {
    async ensureIssue({ repo, title, body, labels }) {
      const issueView = await run([
        "issue",
        "list",
        "--repo",
        repo,
        "--search",
        title,
        "--state",
        "open",
        "--json",
        "number,title,state,url",
        "--limit",
        "20",
      ]);
      if (issueView.status === 0) {
        const issues = JSON.parse(issueView.stdout);
        const exact = issues.find((i) => i.title.trim() === title.trim() && i.state === "OPEN");
        if (exact) {
          return { summary: { number: exact.number, url: exact.url, state: "OPEN", pullRequest: null }, created: false };
        }
      }
      const createArgs = ["issue", "create", "--repo", repo, "--title", title, "--body", body];
      for (const label of labels) createArgs.push("--label", label);
      const created = await run(createArgs);
      if (created.status !== 0) throw new Error(`gh issue create failed: ${created.stderr}`);
      const url = created.stdout.trim().split("\n").pop() ?? "";
      const numMatch = url.match(/\/issues\/(\d+)/);
      const number = numMatch && numMatch[1] ? parseInt(numMatch[1], 10) : -1;
      return {
        summary: { number, url, state: "OPEN", pullRequest: null },
        created,
      };
    },

    async openDraftPullRequest({ repo, head, base, title, body, issueNumber }) {
      const issueBody = body.includes(`Closes #${issueNumber}`) ? body : `${body}\n\nCloses #${issueNumber}`;
      const args = [
        "pr",
        "create",
        "--repo",
        repo,
        "--draft",
        "--base",
        base,
        "--head",
        head,
        "--title",
        title,
        "--body",
        issueBody,
      ];
      const r = await run(args);
      if (r.status !== 0) throw new Error(`gh pr create failed: ${r.stderr}`);
      const url = r.stdout.trim();
      const m = url.match(/\/pull\/(\d+)/);
      const number = m && m[1] ? parseInt(m[1], 10) : -1;
      const fields = await ghJson([
        "pr",
        "view",
        String(number),
        "--repo",
        repo,
        "--json",
        "number,url,baseRefName,headRefName,headRefOid,isDraft,mergeable,mergeStateStatus,merged,mergedAt",
      ]);
      return pullRequestSummaryFromView(fields);
    },

    async updatePullRequestBody({ repo, number, body }) {
      const r = await run(["pr", "edit", String(number), "--repo", repo, "--body", body]);
      if (r.status !== 0) throw new Error(`gh pr edit failed: ${r.stderr}`);
    },

    async markReady({ repo, number }) {
      const r = await run(["pr", "ready", String(number), "--repo", repo]);
      if (r.status !== 0) throw new Error(`gh pr ready failed: ${r.stderr}`);
    },

    async mergePullRequest({ repo, number, subject }) {
      const r = await run([
        "pr",
        "merge",
        String(number),
        "--repo",
        repo,
        "--squash",
        "--subject",
        subject,
      ]);
      if (r.status !== 0) throw new Error(`gh pr merge failed: ${r.stderr}`);
      const fields = await ghJson([
        "pr",
        "view",
        String(number),
        "--repo",
        repo,
        "--json",
        "number,url,baseRefName,headRefName,headRefOid,isDraft,mergeable,mergeStateStatus,merged,mergedAt",
      ]);
      return pullRequestSummaryFromView(fields);
    },

    async readPullRequest({ repo, number }) {
      const fields = await ghJson([
        "pr",
        "view",
        String(number),
        "--repo",
        repo,
        "--json",
        "number,url,baseRefName,headRefName,headRefOid,isDraft,mergeable,mergeStateStatus,merged,mergedAt",
      ]);
      return pullRequestSummaryFromView(fields);
    },

    async readChecks({ repo, sha, required }) {
      const all = await ghJson([
        "pr",
        "checks",
        sha,
        "--repo",
        repo,
        "--json",
        "name,state,bucket",
      ]);
      const out = [];
      for (const requiredName of required) {
        const match = all.find((c) => c.name === requiredName);
        if (!match) {
          out.push({ name: requiredName, state: "pending", bucket: "pending" });
          continue;
        }
        out.push({ name: match.name, state: match.state, bucket: match.bucket });
      }
      return out;
    },

    async comment({ repo, number, body }) {
      const r = await run(["issue", "comment", String(number), "--repo", repo, "--body", body]);
      if (r.status !== 0) throw new Error(`gh issue comment failed: ${r.stderr}`);
    },

    async refreshHead({ repo, number }) {
      const fields = await ghJson([
        "pr",
        "view",
        String(number),
        "--repo",
        repo,
        "--json",
        "headRefOid",
      ]);
      return fields.headRefOid;
    },

    async applyMergeToManifest({ repo, number }, m) {
      const pr = await this.readPullRequest({ repo, number });
      return { ...m, prNumber: pr.number, lastPrHeadSha: pr.headSha };
    },
  };
}
