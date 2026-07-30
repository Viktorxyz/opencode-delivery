/*
 * opencode-ship plugin entry point.
 *
 * The plugin is registered when opencode auto-discovers a file named
 * `opencode-ship.js` under `.opencode/plugin/` (or when the binary is
 * shipped to a consumer via npm install). It does not assume a hard-
 * coded repository, owner, or model; every value is resolved at
 * runtime from the consumer project's own `.opencode/ship.config.json`
 * (falling back to autodetection when the file is missing).
 *
 * The plugin exposes the canonical nine `delivery_*` typed tools and
 * relays every execute call to the existing core factories. It performs
 * no writes during plugin startup beyond a no-op best-effort cleanup
 * of `merged` or `cleanup-pending` manifests queued for retry.
 */

import { tool } from "@opencode-ai/plugin/tool";
import { loadAdapter } from "./adapter.js";
import { createGhDriver } from "./drivers/gh-cli.js";
import {
  createInspectTool,
  createIssueTool,
  createWorktreeTool,
  createVerifyTool,
  createReviewTool,
  createPrTool,
  createReadyTool,
  createMergeTool,
  createCleanupTool,
} from "./tools/index.js";
import { recoverManifestAfterCrash } from "./recovery.js";
import { reconcileOwner } from "./installer/plugin-owner.js";

const VERSION = process.env.OPENCODE_SHIP_VERSION ?? "0.2.0";

const toolDefs = [
  ["delivery_inspect", "Inspect a manifest and run a project-local doctor report.", "inspect"],
  ["delivery_issue", "Find or create the issue for a delivery task.", "issue"],
  ["delivery_worktree", "Create an isolated worktree for the task.", "worktree"],
  ["delivery_verify", "Run the consumer's canonical verification command.", "verify"],
  ["delivery_review", "Record the reviewer verdict against the PR head SHA.", "review"],
  ["delivery_pr", "Open a draft PR linked to the issue.", "pr"],
  ["delivery_ready", "Mark the PR ready after every required gate has passed.", "ready"],
  ["delivery_merge", "Squash merge the PR after an explicit user request.", "merge"],
  ["delivery_cleanup", "Remove the agent-owned worktree and branch after merge.", "cleanup"],
];

function makeTool(id, description, factory, runtime) {
  return tool({
    description,
    args: factory.args,
    async execute(args, ctx) {
      const runner = factory.build(runtime, ctx);
      const env = await runner(args);
      return JSON.stringify(env, null, 2);
    },
  });
}

async function buildRuntime(worktree) {
  const cwd = worktree ?? process.cwd();
  const adapterResult = await loadAdapter(cwd);
  const adapter = adapterResult.ok ? adapterResult.adapter : null;
  const driver = createGhDriver({ cwd });
  const owner = await reconcileOwner(cwd, adapter);
  return {
    cwd,
    adapter,
    driver,
    adapterPath: adapterResult.ok ? adapterResult.path : null,
    adapterLoadError: adapterResult.ok ? null : adapterResult.error,
    owner,
    packageVersion: VERSION,
    recover: () => recoverManifestAfterCrash,
  };
}

const factories = {
  inspect: {
    args: { taskId: tool.schema.string().describe("Manifest taskId to inspect.") },
    build: (rt, ctx) => {
      const tool = createInspectTool({
        driver: rt.driver,
        repoRoot: rt.cwd,
        repoSlug: ctx.project?.worktree?.split("/").slice(-2).join("/") ?? "owner/repo",
        owner: rt.owner,
        adapter: rt.adapter,
        packageVersion: rt.packageVersion,
        remote: "origin",
      });
      return tool;
    },
  },
  issue: {
    args: {
      taskId: tool.schema.string(),
      title: tool.schema.string(),
      body: tool.schema.string().optional(),
      baseBranch: tool.schema.string(),
      baseSha: tool.schema.string().optional(),
      branch: tool.schema.string(),
      labels: tool.schema.array(tool.schema.string()).optional(),
    },
    build: (rt, ctx) =>
      createIssueTool({
        driver: rt.driver,
        repoRoot: rt.cwd,
        repoSlug: ctx.project?.worktree?.split("/").slice(-2).join("/") ?? "owner/repo",
        owner: rt.owner,
        adapter: rt.adapter,
        remote: "origin",
      }),
  },
  worktree: {
    args: {
      taskId: tool.schema.string(),
      branch: tool.schema.string(),
      worktreeRelativePath: tool.schema.string(),
    },
    build: (rt, ctx) =>
      createWorktreeTool({
        driver: rt.driver,
        repoRoot: rt.cwd,
        repoSlug: ctx.project?.worktree?.split("/").slice(-2).join("/") ?? "owner/repo",
        owner: rt.owner,
        adapter: rt.adapter,
        remote: "origin",
      }),
  },
  verify: {
    args: {
      taskId: tool.schema.string(),
      commandId: tool.schema.string().optional(),
    },
    build: (rt, ctx) =>
      createVerifyTool({
        driver: rt.driver,
        repoRoot: rt.cwd,
        repoSlug: ctx.project?.worktree?.split("/").slice(-2).join("/") ?? "owner/repo",
        owner: rt.owner,
        adapter: rt.adapter,
        remote: "origin",
      }),
  },
  review: {
    args: {
      taskId: tool.schema.string(),
      status: tool.schema.enum(["pass", "fail", "blocked", "partial"]),
      headSha: tool.schema.string().optional(),
      findings: tool.schema.unknown().optional(),
      envelope: tool.schema.unknown().optional(),
    },
    build: (rt, ctx) =>
      createReviewTool({
        driver: rt.driver,
        repoRoot: rt.cwd,
        repoSlug: ctx.project?.worktree?.split("/").slice(-2).join("/") ?? "owner/repo",
        owner: rt.owner,
        adapter: rt.adapter,
        remote: "origin",
      }),
  },
  pr: {
    args: {
      taskId: tool.schema.string(),
      title: tool.schema.string(),
      body: tool.schema.string(),
    },
    build: (rt, ctx) =>
      createPrTool({
        driver: rt.driver,
        repoRoot: rt.cwd,
        repoSlug: ctx.project?.worktree?.split("/").slice(-2).join("/") ?? "owner/repo",
        owner: rt.owner,
        adapter: rt.adapter,
        remote: "origin",
      }),
  },
  ready: { args: { taskId: tool.schema.string() }, build: (rt, ctx) =>
      createReadyTool({
        driver: rt.driver,
        repoRoot: rt.cwd,
        repoSlug: ctx.project?.worktree?.split("/").slice(-2).join("/") ?? "owner/repo",
        owner: rt.owner,
        adapter: rt.adapter,
        remote: "origin",
      }) },
  merge: {
    args: { taskId: tool.schema.string(), subject: tool.schema.string() },
    build: (rt, ctx) =>
      createMergeTool({
        driver: rt.driver,
        repoRoot: rt.cwd,
        repoSlug: ctx.project?.worktree?.split("/").slice(-2).join("/") ?? "owner/repo",
        owner: rt.owner,
        adapter: rt.adapter,
        remote: "origin",
      }),
  },
  cleanup: {
    args: { taskId: tool.schema.string() },
    build: (rt, ctx) =>
      createCleanupTool({
        driver: rt.driver,
        repoRoot: rt.cwd,
        repoSlug: ctx.project?.worktree?.split("/").slice(-2).join("/") ?? "owner/repo",
        owner: rt.owner,
        adapter: rt.adapter,
        remote: "origin",
      }),
  },
};

export const ShipPlugin = async (ctx) => {
  const runtime = await buildRuntime(ctx.worktree);
  const tools = {};
  for (const [id, description, key] of toolDefs) {
    const factory = factories[key];
    tools[id] = makeTool(id, description, factory, runtime);
  }
  return {
    tool: tools,
    "experimental.session.compacting": async (input, output) => {
      const current = Array.isArray(output.context) ? output.context : [];
      output.context = [
        ...current,
        "opencode-ship plugin is loaded; one issue -> one worktree -> one PR -> one merge -> one cleanup.",
      ];
    },
    async event({ event }) {
      if (event?.type === "session.idle") {
        const recon = runtime.recover();
        void recon;
      }
    },
  };
};

export default ShipPlugin;
