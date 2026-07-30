/*
 * opencode-ship plugin entry point.
 *
 * Registered when opencode auto-discovers `.opencode/plugin/opencode-ship.js`
 * (no consumer-side wrapper) or when shipped as the `opencode-ship` npm
 * package. The plugin does not assume a hard-coded repository, owner,
 * or model; every value is resolved at runtime from the consumer
 * project's own `.opencode/ship.config.json` (falling back to
 * autodetection when the file is missing).
 *
 * The plugin exposes the canonical nine `delivery_*` typed tools and
 * relays every execute call to the existing core factories. Plugin
 * startup performs no writes other than a best-effort retry of the
 * `cleanupPending` queue tracked in `.opencode/ship.lock.json`.
 */

import { tool } from "@opencode-ai/plugin/tool";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
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
import { loadConfig, renderDefaultConfig, configPath } from "./installer/config.js";
import { readLock } from "./installer/lock.js";
import { detectProject } from "./installer/detection/project.js";
import { tryImmediateCleanup, listPending } from "./installer/cleanup.js";
import { flattenShipConfig } from "./installer/ship-adapter.js";

const VERSION = process.env.OPENCODE_SHIP_VERSION ?? "0.2.0";

const toolDefs = [
  ["delivery_inspect", "Inspect a manifest and a project-local doctor report.", "inspect"],
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
      let env = await runner(args);
      const taskId = typeof args?.taskId === "string" ? args.taskId : null;
      if (env?.kind === "merge" && taskId) {
        runtime.lastTaskId = taskId;
        const result = await tryImmediateCleanup({
          repoRoot: runtime.repoRoot, taskId, adapter: runtime.adapter,
        }).catch((e) => ({ ok: false, reason: String(e?.message ?? e) }));
        env = { ...env, cleanup: result };
      }
      return JSON.stringify(env, null, 2);
    },
  });
}

async function resolveRepoSlug(repoRoot, detection, config) {
  const fromConfig = config?.value?.project?.repository;
  if (typeof fromConfig === "string" && fromConfig.includes("/")) return fromConfig;
  if (detection?.repository) return detection.repository;
  const gitConfig = await readFile(resolve(repoRoot, ".git/config"), "utf8").catch(() => null);
  if (gitConfig) {
    const m = gitConfig.match(/url\s*=\s*.*?github\.com[:/]([^/]+)\/([^/\s]+?)(?:\.git)?\b/);
    if (m) return `${m[1]}/${m[2]}`;
  }
  return null;
}

async function resolveOwner(repoRoot, detection, config, adapter) {
  const explicit = config?.value?.owner;
  if (typeof explicit === "string" && explicit.trim()) return explicit.trim();
  return reconcileOwner(repoRoot, adapter);
}

function shippingLockValue(repoRoot) {
  return readLock(repoRoot);
}

async function bestEffortCleanupQueue(repoRoot, adapter) {
  const lock = await shippingLockValue(repoRoot);
  const pending = lock?.cleanupPending ?? [];
  const out = { reconciled: 0, retained: 0, failures: [] };
  const tasks = await listPending(repoRoot).catch(() => []);
  for (const manifest of tasks) {
    const r = await tryImmediateCleanup({ repoRoot, taskId: manifest.taskId, adapter });
    if (r.ok) out.reconciled += 1;
    else {
      out.retained += 1;
      const reason = (r && typeof r === "object" && "reason" in r) ? r.reason : "unknown";
      out.failures.push({ taskId: manifest.taskId, reason: reason ?? "unknown" });
    }
  }
  return { pending, manifestTasks: tasks.map((t) => t.taskId), ...out };
}

async function buildRuntime(worktree) {
  const repoRootAbs = resolve(worktree ?? process.cwd());
  const detection = detectProject(repoRootAbs);
  const legacyAdapter = await loadAdapter(repoRootAbs);
  const config = await loadConfig(repoRootAbs);
  const configValue = config?.ok ? config.value : renderDefaultConfig(detection);
  const shipAdapter = flattenShipConfig(configValue);
  const adapter = legacyAdapter.ok ? legacyAdapter.adapter : shipAdapter;
  const repoSlug = await resolveRepoSlug(repoRootAbs, detection, config);
  const owner = await resolveOwner(repoRootAbs, detection, config, adapter);
  const driver = createGhDriver({ cwd: repoRootAbs });

  const cleanup = await bestEffortCleanupQueue(repoRootAbs, adapter).catch(() => null);

  return {
    cwd: process.cwd(),
    repoRoot: repoRootAbs,
    adapter,
    legacyAdapterPath: legacyAdapter.ok ? legacyAdapter.path : null,
    legacyAdapterLoadError: legacyAdapter.ok ? null : legacyAdapter.error,
    config,
    configPath: config?.ok ? config.path : configPath(repoRootAbs),
    configValue,
    repoSlug: repoSlug ?? "owner/repo",
    owner,
    driver,
    packageVersion: VERSION,
    lastTaskId: null,
    cleanupQueueOnStartup: cleanup,
    recover: () => recoverManifestAfterCrash,
  };
}

const factories = {
  inspect: {
    args: { taskId: tool.schema.string().describe("Manifest taskId to inspect.") },
    build: (rt) => createInspectTool({
      driver: rt.driver,
      repoRoot: rt.repoRoot,
      repoSlug: rt.repoSlug,
      owner: rt.owner,
      adapter: rt.adapter,
      packageVersion: rt.packageVersion,
      remote: "origin",
    }),
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
    build: (rt) => createIssueTool({
      driver: rt.driver,
      repoRoot: rt.repoRoot,
      repoSlug: rt.repoSlug,
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
    build: (rt) => createWorktreeTool({
      driver: rt.driver,
      repoRoot: rt.repoRoot,
      repoSlug: rt.repoSlug,
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
    build: (rt) => createVerifyTool({
      driver: rt.driver,
      repoRoot: rt.repoRoot,
      repoSlug: rt.repoSlug,
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
    build: (rt) => createReviewTool({
      driver: rt.driver,
      repoRoot: rt.repoRoot,
      repoSlug: rt.repoSlug,
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
    build: (rt) => createPrTool({
      driver: rt.driver,
      repoRoot: rt.repoRoot,
      repoSlug: rt.repoSlug,
      owner: rt.owner,
      adapter: rt.adapter,
      remote: "origin",
    }),
  },
  ready: { args: { taskId: tool.schema.string() }, build: (rt) => createReadyTool({
    driver: rt.driver,
    repoRoot: rt.repoRoot,
    repoSlug: rt.repoSlug,
    owner: rt.owner,
    adapter: rt.adapter,
    remote: "origin",
  }) },
  merge: {
    args: { taskId: tool.schema.string(), subject: tool.schema.string() },
    build: (rt) => createMergeTool({
      driver: rt.driver,
      repoRoot: rt.repoRoot,
      repoSlug: rt.repoSlug,
      owner: rt.owner,
      adapter: rt.adapter,
      remote: "origin",
    }),
  },
  cleanup: {
    args: { taskId: tool.schema.string() },
    build: (rt) => createCleanupTool({
      driver: rt.driver,
      repoRoot: rt.repoRoot,
      repoSlug: rt.repoSlug,
      owner: rt.owner,
      adapter: rt.adapter,
      remote: "origin",
    }),
  },
};

export const ShipPlugin = async (ctx) => {
  const worktree = (ctx && ctx.worktree) || process.cwd();
  const runtime = await buildRuntime(worktree);
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
    event: async ({ event }) => {
      if (!event) return;
      if (event.type === "session.created" || event.type === "session.idle") {
        await bestEffortCleanupQueue(runtime.repoRoot, runtime.adapter).catch(() => null);
      }
    },
  };
};

export default ShipPlugin;
