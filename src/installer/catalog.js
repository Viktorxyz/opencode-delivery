/*
 * opencode-ship asset catalog.
 *
 * Describes the consumer-managed files opencode-ship needs to install
 * or migrate. The catalog is immutable and ships inside the package;
 * each entry fixes the on-disk path, the source template path inside
 * the published tarball, and the kind used by the lock and the
 * planner.
 */

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));

const TEMPLATE_SET = "v0.2.0";

export const CATALOG = [
  {
    kind: "plugin",
    path: ".opencode/plugin/opencode-ship.js",
    source: resolve(packageRoot, "dist/plugin.js"),
    mode: 0o644,
  },
  {
    kind: "agent",
    path: ".opencode/agents/delivery-reviewer.md",
    source: resolve(packageRoot, "assets/agents/delivery-reviewer.md"),
    mode: 0o644,
  },
  {
    kind: "agent",
    path: ".opencode/agents/delivery-verifier.md",
    source: resolve(packageRoot, "assets/agents/delivery-verifier.md"),
    mode: 0o644,
  },
  {
    kind: "skill",
    path: ".opencode/skills/delivery-workflow/SKILL.md",
    source: resolve(packageRoot, "assets/skills/delivery-workflow/SKILL.md"),
    mode: 0o644,
  },
  {
    kind: "skill",
    path: ".opencode/skills/planning-research-checkpoint/SKILL.md",
    source: resolve(packageRoot, "assets/skills/planning-research-checkpoint/SKILL.md"),
    mode: 0o644,
  },
];

export const LOCK_RELATIVE = ".opencode/ship.lock.json";
export const CONFIG_RELATIVE = ".opencode/ship.config.json";

export function getTemplateSet() {
  return TEMPLATE_SET;
}

export const POINTER_ENTRIES = [
  {
    pointer: "/agent/build/permission/delivery_inspect",
    strategy: "value",
    value: "allow",
  },
  {
    pointer: "/agent/build/permission/delivery_issue",
    strategy: "value",
    value: "allow",
  },
  {
    pointer: "/agent/build/permission/delivery_worktree",
    strategy: "value",
    value: "allow",
  },
  {
    pointer: "/agent/build/permission/delivery_verify",
    strategy: "value",
    value: "deny",
  },
  {
    pointer: "/agent/build/permission/delivery_review",
    strategy: "value",
    value: "deny",
  },
  {
    pointer: "/agent/build/permission/delivery_pr",
    strategy: "value",
    value: "allow",
  },
  {
    pointer: "/agent/build/permission/delivery_ready",
    strategy: "value",
    value: "allow",
  },
  {
    pointer: "/agent/build/permission/delivery_merge",
    strategy: "value",
    value: "ask",
  },
  {
    pointer: "/agent/build/permission/delivery_cleanup",
    strategy: "value",
    value: "allow",
  },
  {
    pointer: "/agent/build/permission/task/delivery-reviewer",
    strategy: "value",
    value: "allow",
  },
  {
    pointer: "/agent/build/permission/task/delivery-verifier",
    strategy: "value",
    value: "allow",
  },
];
