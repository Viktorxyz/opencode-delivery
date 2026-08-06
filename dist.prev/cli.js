#!/usr/bin/env node
// opencode-ship CLI v0.10.0-rc.1
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// src/installer/json-pointer.js
function unescape(token) {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}
function* parsePointer(pointer) {
  if (typeof pointer !== "string" || pointer === "") return;
  if (pointer[0] !== "/") {
    yield "";
    return;
  }
  const trimmed = pointer.slice(1);
  if (trimmed === "") return;
  for (const token of trimmed.split("/")) yield unescape(token);
}
function getPointer(doc, pointer) {
  if (pointer === "" || pointer === "/") return void 0;
  let current = doc;
  for (const token of parsePointer(pointer)) {
    if (current === null || current === void 0) return void 0;
    if (typeof token === "string" && token.includes("=")) return void 0;
    current = current?.[token];
  }
  return current;
}
function setPointer(doc, pointer, value) {
  const tokens = [...parsePointer(pointer)];
  if (tokens.length === 0) return value;
  if (!isObject(doc)) return value;
  const root = { ...doc };
  let cursor = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i];
    const next = cursor[key];
    const copy = isObject(next) ? { ...next } : Array.isArray(next) ? [...next] : {};
    cursor[key] = copy;
    cursor = copy;
  }
  cursor[tokens[tokens.length - 1]] = value;
  return root;
}
function removePointer(doc, pointer) {
  const tokens = [...parsePointer(pointer)];
  if (tokens.length === 0) return doc;
  if (!isObject(doc)) return doc;
  const root = { ...doc };
  let cursor = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i];
    const copy = isObject(cursor[key]) ? { ...cursor[key] } : { ...cursor[key] };
    cursor[key] = copy;
    cursor = copy;
  }
  delete cursor[tokens[tokens.length - 1]];
  return root;
}
function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
var init_json_pointer = __esm({
  "src/installer/json-pointer.js"() {
  }
});

// src/installer/hash.js
import { createHash } from "node:crypto";
function bytesHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}
function bytesHashString(text) {
  return bytesHash(Buffer.from(text, "utf8"));
}
var init_hash = __esm({
  "src/installer/hash.js"() {
    init_json_pointer();
  }
});

// src/installer/plan-mode-permissions.js
function planModePermissions() {
  return {
    build: {
      bash: DENY_DEFAULT,
      edit: {
        "*": DENY_DEFAULT,
        [PLANS_GLOB]: ALLOW_PLANS
      },
      webfetch: DENY_DEFAULT,
      task: DENY_DEFAULT,
      delivery_inspect: DENY_DEFAULT,
      delivery_issue: DENY_DEFAULT,
      delivery_worktree: DENY_DEFAULT,
      delivery_verify: DENY_DEFAULT,
      delivery_review: DENY_DEFAULT,
      delivery_pr: DENY_DEFAULT,
      delivery_ready: DENY_DEFAULT,
      delivery_merge: DENY_DEFAULT,
      delivery_cleanup: DENY_DEFAULT
    }
  };
}
var PLAN_PATH_PREFIX, DENY_DEFAULT, ALLOW_PLANS, PLANS_GLOB;
var init_plan_mode_permissions = __esm({
  "src/installer/plan-mode-permissions.js"() {
    PLAN_PATH_PREFIX = ".git/opencode-ship/plans";
    DENY_DEFAULT = "deny";
    ALLOW_PLANS = "allow";
    PLANS_GLOB = `${PLAN_PATH_PREFIX}/**`;
  }
});

// src/installer/root-config.js
var root_config_exports = {};
__export(root_config_exports, {
  PLAN_MODE_POINTER: () => PLAN_MODE_POINTER,
  POINTER_ENTRIES: () => POINTER_ENTRIES,
  applyOwnedPointers: () => applyOwnedPointers,
  applyPlanModeOwnership: () => applyPlanModeOwnership,
  defaultRootConfigPath: () => defaultRootConfigPath,
  findRootConfig: () => findRootConfig,
  formatRootConfig: () => formatRootConfig,
  formatRootConfigPreserving: () => formatRootConfigPreserving,
  parseRootConfigPreservingOrder: () => parseRootConfigPreservingOrder,
  planModeBlock: () => planModeBlock,
  readRootConfig: () => readRootConfig,
  synthesizeDefaultRootConfig: () => synthesizeDefaultRootConfig
});
import { existsSync as existsSync5, readFileSync as readFileSync3 } from "node:fs";
import { readFile as readFile2 } from "node:fs/promises";
import { resolve as resolve5 } from "node:path";
function findRootConfig(repoRoot) {
  for (const rel of ROOT_PATH_CANDIDATES) {
    const abs = resolve5(repoRoot, rel);
    if (existsSync5(abs)) return { path: abs, relative: rel, format: rel.endsWith(".jsonc") ? "jsonc" : "json" };
  }
  return { path: null, relative: ROOT_PATH_CANDIDATES[0], format: "json" };
}
function defaultRootConfigPath(repoRoot) {
  return resolve5(repoRoot, ROOT_PATH_CANDIDATES[0]);
}
function readRootConfig(absPath) {
  if (!existsSync5(absPath)) {
    return { ok: false, error: { kind: "missing", path: absPath } };
  }
  const raw = readFileSync3(absPath, "utf8");
  const stripped = stripJsonc(raw);
  try {
    const value = JSON.parse(stripped);
    return {
      ok: true,
      path: absPath,
      raw,
      sha256: bytesHashString(raw),
      value,
      before: snapshotValues(value),
      format: absPath.endsWith(".jsonc") ? "jsonc" : "json"
    };
  } catch (e) {
    return { ok: false, error: { kind: "parse", path: absPath, message: e.message } };
  }
}
function snapshotValues(doc) {
  const out = {};
  for (const entry of POINTER_ENTRIES) {
    out[entry.pointer] = getPointer(doc, entry.pointer);
  }
  return out;
}
function stripJsonc(text) {
  let stripped = "";
  let i = 0;
  let inString = false;
  let escape = false;
  while (i < text.length) {
    const ch = text[i];
    if (inString) {
      stripped += ch;
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = true;
      stripped += ch;
      i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && text[i + 1] === "*") {
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    stripped += ch;
    i += 1;
  }
  return stripped.replace(/,\s*([}\]])/g, "$1");
}
function applyOwnedPointers(rootDoc, { pointerEntries = POINTER_ENTRIES, allowEqualValues = true } = {}) {
  const result = { doc: rootDoc, applied: [], skipped: [] };
  let doc = rootDoc;
  for (const entry of pointerEntries) {
    const existing = getPointer(doc, entry.pointer);
    if (existing === void 0) {
      doc = setPointer(doc, entry.pointer, entry.value);
      result.applied.push({ pointer: entry.pointer, value: entry.value });
      continue;
    }
    if (existing === entry.value) {
      if (allowEqualValues) {
        result.skipped.push({ pointer: entry.pointer, reason: "already equal" });
      }
      continue;
    }
    result.skipped.push({
      pointer: entry.pointer,
      reason: "different existing value",
      existing,
      desired: entry.value
    });
  }
  return result;
}
function applyPlanModeOwnership(rootDoc, { pointer = PLAN_MODE_POINTER, block = planModePermissions().build } = {}) {
  const previous = getPointer(rootDoc, pointer);
  const doc = setPointer(rootDoc, pointer, block);
  return { doc, previous: previous === void 0 ? null : previous, id: pointer };
}
function planModeBlock() {
  return planModePermissions().build;
}
function synthesizeDefaultRootConfig() {
  return {
    $schema: "https://opencode.ai/config.json",
    agent: {
      build: {
        permission: {
          delivery_inspect: "allow",
          delivery_issue: "allow",
          delivery_worktree: "allow",
          delivery_verify: "deny",
          delivery_review: "deny",
          delivery_pr: "allow",
          delivery_ready: "allow",
          delivery_merge: "ask",
          delivery_cleanup: "allow",
          task: {
            "delivery-reviewer": "allow",
            "delivery-verifier": "allow"
          }
        }
      }
    }
  };
}
function formatRootConfig(value) {
  return JSON.stringify(stripSourceOrder(value), null, 2) + "\n";
}
function stripSourceOrder(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const out = Array.isArray(value) ? [] : {};
  const order = Array.isArray(value.__sourceOrder__) ? value.__sourceOrder__ : null;
  const seen = /* @__PURE__ */ new Set();
  if (order) {
    for (const k of order) {
      if (k === "__sourceOrder__") continue;
      if (!(k in value)) continue;
      seen.add(k);
      out[k] = stripSourceOrder(value[k]);
    }
  }
  for (const k of Object.keys(value)) {
    if (k === "__sourceOrder__") continue;
    if (seen.has(k)) continue;
    out[k] = stripSourceOrder(value[k]);
  }
  return out;
}
function formatRootConfigPreserving(value) {
  return formatRootConfig(value);
}
function parseRootConfigPreservingOrder(text) {
  if (typeof text !== "string" || text.length === 0) {
    return { value: {}, format: "json" };
  }
  const parser = new RootConfigParser(text);
  const value = parser.parseValue(
    0,
    /*atTop*/
    true
  );
  const isJsonc = text.includes("//") || text.includes("/*");
  return { value, format: isJsonc ? "jsonc" : "json" };
}
var POINTER_ENTRIES, ROOT_PATH_CANDIDATES, PLAN_MODE_POINTER, RootConfigParser;
var init_root_config = __esm({
  "src/installer/root-config.js"() {
    init_json_pointer();
    init_hash();
    init_plan_mode_permissions();
    POINTER_ENTRIES = [
      {
        pointer: "/agent/build/permission/delivery_inspect",
        strategy: "value",
        value: "allow"
      },
      {
        pointer: "/agent/build/permission/delivery_issue",
        strategy: "value",
        value: "allow"
      },
      {
        pointer: "/agent/build/permission/delivery_worktree",
        strategy: "value",
        value: "allow"
      },
      {
        pointer: "/agent/build/permission/delivery_verify",
        strategy: "value",
        value: "deny"
      },
      {
        pointer: "/agent/build/permission/delivery_review",
        strategy: "value",
        value: "deny"
      },
      {
        pointer: "/agent/build/permission/delivery_pr",
        strategy: "value",
        value: "allow"
      },
      {
        pointer: "/agent/build/permission/delivery_ready",
        strategy: "value",
        value: "allow"
      },
      {
        pointer: "/agent/build/permission/delivery_merge",
        strategy: "value",
        value: "ask"
      },
      {
        pointer: "/agent/build/permission/delivery_cleanup",
        strategy: "value",
        value: "allow"
      },
      {
        pointer: "/agent/build/permission/task/delivery-reviewer",
        strategy: "value",
        value: "allow"
      },
      {
        pointer: "/agent/build/permission/task/delivery-verifier",
        strategy: "value",
        value: "allow"
      }
    ];
    ROOT_PATH_CANDIDATES = ["opencode.json", "opencode.jsonc"];
    PLAN_MODE_POINTER = "/agent/plan/permission";
    RootConfigParser = class {
      constructor(text) {
        this.text = text;
        this.pos = 0;
      }
      skipWS() {
        while (this.pos < this.text.length) {
          const ch = this.text[this.pos];
          if (ch === " " || ch === "\n" || ch === "	" || ch === "\r") {
            this.pos += 1;
            continue;
          }
          if (ch === "/" && this.text[this.pos + 1] === "/") {
            while (this.pos < this.text.length && this.text[this.pos] !== "\n") this.pos += 1;
            continue;
          }
          if (ch === "/" && this.text[this.pos + 1] === "*") {
            this.pos += 2;
            while (this.pos < this.text.length && !(this.text[this.pos] === "*" && this.text[this.pos + 1] === "/")) this.pos += 1;
            this.pos += 2;
            continue;
          }
          break;
        }
      }
      parseValue(depth, atTop) {
        this.skipWS();
        const ch = this.text[this.pos];
        if (ch === "{") return this.parseObject(depth, atTop);
        if (ch === "[") return this.parseArray(depth);
        if (ch === '"') return this.parseString();
        if (ch === "-" || ch >= "0" && ch <= "9") return this.parseNumber();
        if (this.text.startsWith("true", this.pos)) {
          this.pos += 4;
          return true;
        }
        if (this.text.startsWith("false", this.pos)) {
          this.pos += 5;
          return false;
        }
        if (this.text.startsWith("null", this.pos)) {
          this.pos += 4;
          return null;
        }
        throw new Error(`unexpected token at ${this.pos}: ${this.text.slice(this.pos, this.pos + 8)}`);
      }
      parseObject(depth, atTop) {
        const out = /* @__PURE__ */ Object.create(null);
        out.__sourceOrder__ = [];
        this.pos += 1;
        while (this.pos < this.text.length) {
          this.skipWS();
          if (this.text[this.pos] === "}") {
            this.pos += 1;
            return out;
          }
          const key = this.parseString();
          out.__sourceOrder__.push(key);
          this.skipWS();
          if (this.text[this.pos] !== ":") throw new Error(`expected : at ${this.pos}`);
          this.pos += 1;
          out[key] = this.parseValue(depth + 1, false);
          this.skipWS();
          if (this.text[this.pos] === ",") {
            this.pos += 1;
            continue;
          }
          if (this.text[this.pos] === "}") {
            this.pos += 1;
            return out;
          }
          throw new Error(`expected , or } at ${this.pos}`);
        }
        throw new Error("unterminated object");
      }
      parseArray(depth) {
        const out = [];
        this.pos += 1;
        while (this.pos < this.text.length) {
          this.skipWS();
          if (this.text[this.pos] === "]") {
            this.pos += 1;
            return out;
          }
          out.push(this.parseValue(depth + 1, false));
          this.skipWS();
          if (this.text[this.pos] === ",") {
            this.pos += 1;
            continue;
          }
          if (this.text[this.pos] === "]") {
            this.pos += 1;
            return out;
          }
          throw new Error(`expected , or ] at ${this.pos}`);
        }
        throw new Error("unterminated array");
      }
      parseString() {
        if (this.text[this.pos] !== '"') throw new Error(`expected " at ${this.pos}`);
        this.pos += 1;
        let out = "";
        while (this.pos < this.text.length) {
          const ch = this.text[this.pos];
          if (ch === "\\") {
            const next = this.text[this.pos + 1];
            out += ch + next;
            this.pos += 2;
            continue;
          }
          if (ch === '"') {
            this.pos += 1;
            return JSON.parse('"' + out + '"');
          }
          out += ch;
          this.pos += 1;
        }
        throw new Error("unterminated string");
      }
      parseNumber() {
        const start = this.pos;
        if (this.text[this.pos] === "-") this.pos += 1;
        while (this.pos < this.text.length && /[0-9.eE+\-]/.test(this.text[this.pos])) this.pos += 1;
        return Number(this.text.slice(start, this.pos));
      }
    };
  }
});

// src/profile.js
var PROFILES = Object.freeze(["core", "engineering"]);
var DEFAULT_PROFILE = "core";
function isValidProfile(name) {
  return typeof name === "string" && PROFILES.includes(name);
}
function normalizeProfile(name) {
  if (name === void 0 || name === null) return DEFAULT_PROFILE;
  if (!isValidProfile(name)) return null;
  return name;
}
function resolveProfile({ cli = null, config = null, lock = null } = {}) {
  if (cli !== null && cli !== void 0) {
    const v = normalizeProfile(cli);
    if (v === null) {
      throw new Error(`unknown CLI profile '${cli}' (expected one of: ${PROFILES.join(", ")})`);
    }
    return { profile: v, source: "cli" };
  }
  if (config && typeof config === "object" && config.profile !== void 0 && config.profile !== null) {
    const v = normalizeProfile(config.profile);
    if (v === null) {
      throw new Error(
        `unknown ship.config.json profile '${config.profile}' (expected one of: ${PROFILES.join(", ")})`
      );
    }
    return { profile: v, source: "config" };
  }
  if (lock && typeof lock === "object" && lock.manager && lock.manager.profile !== void 0) {
    const v = normalizeProfile(lock.manager.profile);
    if (v === null) {
      throw new Error(
        `unknown lock manager.profile '${lock.manager.profile}' (expected one of: ${PROFILES.join(", ")})`
      );
    }
    return { profile: v, source: "lock" };
  }
  return { profile: DEFAULT_PROFILE, source: "default" };
}

// src/installer/cli-args.js
var USAGE = `opencode-ship <command> [options]

Commands:
  init        Install or update managed files in this project.
  diff        Show what would change without writing.
  update      Apply pending updates after recovering the journal.
  doctor      Validate environment, lock, and references.
  uninstall   Remove managed files that still match the lock.
  --version   Print the version and exit.
  --help      Show this usage and exit.

Options:
  --root <path>               Project root (defaults to cwd).
  --profile <name>            Override active profile: ${PROFILES.join(", ")}.
  --force-config              Rewrite the user config from detection (init only).
  --force-root-config         Create opencode.json when absent (init only).
  --strict-doctor             Fail init when doctor reports unhealthy checks.
  --replace-managed           Replace locally-modified managed files (update only).
  --purge-config              Remove ship.config.json when uninstalling.
  --planner-model <id>        Engineering model id for the strong planner.
  --builder-model <id>        Engineering model id for the cheap builder.
  --final-reviewer-model <id> Engineering model id for the Standards + Spec reviewer.
  --json                      Emit a JSON envelope instead of human output.
`;
var MODEL_ID_RE = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;
function parseFlags(argv) {
  const options = {
    rootPath: null,
    profile: null,
    json: false,
    replaceManaged: false,
    purgeConfig: false,
    forceConfig: false,
    forceRootConfig: false,
    strictDoctor: false,
    plannerModel: null,
    builderModel: null,
    finalReviewerModel: null
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--replace-managed") options.replaceManaged = true;
    else if (arg === "--purge-config") options.purgeConfig = true;
    else if (arg === "--force-config") options.forceConfig = true;
    else if (arg === "--force-root-config") options.forceRootConfig = true;
    else if (arg === "--strict-doctor") options.strictDoctor = true;
    else if (arg === "--root") options.rootPath = argv[++i];
    else if (arg === "--profile") {
      const value = argv[++i];
      if (value === void 0) {
        return { error: "--profile requires a value" };
      }
      if (!isValidProfile(value)) {
        return { error: `unknown profile '${value}' (expected one of: ${PROFILES.join(", ")})` };
      }
      options.profile = value;
    } else if (arg === "--planner-model" || arg === "--builder-model" || arg === "--final-reviewer-model") {
      const value = argv[++i];
      if (value === void 0) return { error: `${arg} requires a value` };
      if (!MODEL_ID_RE.test(value)) {
        return { error: `${arg} must be a "<provider>/<model>" id, got ${JSON.stringify(value)}` };
      }
      if (arg === "--planner-model") options.plannerModel = value;
      else if (arg === "--builder-model") options.builderModel = value;
      else options.finalReviewerModel = value;
    } else if (arg === "-h" || arg === "--help") return { help: true };
    else if (arg === "-v" || arg === "--version") return { version: true };
    else return { error: `unknown flag ${arg}` };
  }
  return options;
}
function parseCommand(argv) {
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") return { command: "help" };
    if (arg === "--version" || arg === "-v") return { command: "version" };
  }
  const [cmd, ...rest] = argv;
  if (!cmd) return { command: "help" };
  const flags = parseFlags(rest);
  if ("help" in flags) return { command: "help" };
  if ("version" in flags) return { command: "version" };
  if ("error" in flags) return { error: flags.error };
  switch (cmd) {
    case "init":
    case "diff":
    case "update":
    case "doctor":
    case "uninstall":
      return { command: cmd, options: flags };
    default:
      return { error: `unknown command ${cmd}` };
  }
}
function helpText() {
  return USAGE;
}

// src/installer/executor.js
import { existsSync as existsSync13 } from "node:fs";
import { mkdir as mkdir5, readFile as readFile8, rename as rename5, unlink as unlink3, writeFile as writeFile5 } from "node:fs/promises";
import { dirname as dirname7, resolve as resolve12 } from "node:path";

// src/installer/catalog.js
import { resolve as resolve3, relative, sep } from "node:path";
import { existsSync as existsSync3, statSync } from "node:fs";

// src/installer/package-root.js
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
var PACKAGE_NAME = "opencode-ship";
function resolvePackageRoot(startUrl) {
  let candidate = dirname(fileURLToPath(startUrl ?? import.meta.url));
  while (candidate && candidate !== "/") {
    const pkgPath = resolve(candidate, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const raw = readFileSync(pkgPath, "utf8");
        const pkg = JSON.parse(raw);
        if (pkg && pkg.name === PACKAGE_NAME) return candidate;
      } catch {
      }
    }
    candidate = dirname(candidate);
  }
  throw new Error(`opencode-ship package root not found from ${startUrl ?? import.meta.url}`);
}

// src/version.js
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "node:fs";
import { dirname as dirname2, resolve as resolve2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
var PACKAGE_VERSION = "0.10.0-rc.1";
var TEMPLATE_SET = `v${PACKAGE_VERSION}`;

// src/installer/catalog.js
var TEMPLATE_SET_ID = TEMPLATE_SET;
var packageRoot = resolvePackageRoot(import.meta.url);
var MATT_SKILLS = [
  "setup-engineering-workflow",
  "engineering-workflow",
  "grilling",
  "domain-modeling",
  "grill-with-docs",
  "triage",
  "to-spec",
  "to-tickets",
  "wayfinder",
  "handoff",
  "research",
  "prototype",
  "codebase-design",
  "code-review"
];
var SUPER_SKILLS = [
  "brainstorming",
  "writing-plans",
  "executing-plans",
  "subagent-driven-development",
  "dispatching-parallel-agents",
  "test-driven-development",
  "systematic-debugging",
  "verification-before-completion",
  "requesting-code-review",
  "receiving-code-review"
];
var ENGINEERING_AGENTS = [
  "ship-controller",
  "ship-planner",
  "ship-task-builder",
  "ship-task-reviewer",
  "ship-final-standards-reviewer",
  "ship-final-spec-reviewer"
];
var ENGINEERING_COMMANDS = [
  "ship-deliver",
  "ship-resume",
  "ship-status"
];
var CATALOG = [
  {
    id: "plugin:opencode-ship",
    kind: "plugin",
    path: ".opencode/plugins/opencode-ship.js",
    source: resolve3(packageRoot, "dist/plugin.js"),
    mode: 420,
    profiles: ["core", "engineering"]
  },
  {
    id: "agent:delivery-reviewer",
    kind: "agent",
    path: ".opencode/agents/delivery-reviewer.md",
    source: resolve3(packageRoot, "assets/agents/delivery-reviewer.md"),
    mode: 420,
    profiles: ["core", "engineering"]
  },
  {
    id: "agent:delivery-verifier",
    kind: "agent",
    path: ".opencode/agents/delivery-verifier.md",
    source: resolve3(packageRoot, "assets/agents/delivery-verifier.md"),
    mode: 420,
    profiles: ["core", "engineering"]
  },
  ...ENGINEERING_AGENTS.map((name) => ({
    id: `agent:${name}`,
    kind: "agent",
    path: `.opencode/agents/${name}.md`,
    source: resolve3(packageRoot, `assets/agents/${name}.md`),
    mode: 420,
    profiles: ["engineering"]
  })),
  ...ENGINEERING_COMMANDS.map((name) => ({
    id: `command:${name}`,
    kind: "support",
    path: `.opencode/commands/${name}.md`,
    source: resolve3(packageRoot, `assets/commands/${name}.md`),
    mode: 420,
    profiles: ["engineering"]
  })),
  {
    id: "skill:delivery-workflow",
    kind: "skill",
    path: ".opencode/skills/delivery-workflow/SKILL.md",
    source: resolve3(packageRoot, "assets/skills/delivery-workflow/SKILL.md"),
    mode: 420,
    profiles: ["core", "engineering"]
  },
  {
    id: "skill:planning-research-checkpoint",
    kind: "skill",
    path: ".opencode/skills/planning-research-checkpoint/SKILL.md",
    source: resolve3(packageRoot, "assets/skills/planning-research-checkpoint/SKILL.md"),
    mode: 420,
    profiles: ["core", "engineering"]
  },
  ...MATT_SKILLS.map((name) => ({
    id: `skill:matt:${name}`,
    kind: "skill",
    path: `.opencode/skills/${name}/SKILL.md`,
    source: resolve3(packageRoot, `assets/skills/${name}/SKILL.md`),
    mode: 420,
    profiles: ["engineering"]
  })),
  ...SUPER_SKILLS.map((name) => ({
    id: `skill:super:${name}`,
    kind: "skill",
    path: `.opencode/skills/${name}/SKILL.md`,
    source: resolve3(packageRoot, `assets/skills/${name}/SKILL.md`),
    mode: 420,
    profiles: ["engineering"]
  }))
];
function filterCatalogByProfile(catalog, profile) {
  const effective = profile === void 0 || profile === null ? DEFAULT_PROFILE : profile;
  if (!isValidProfile(effective)) {
    throw new Error(
      `filterCatalogByProfile: unknown profile '${profile}' (expected one of: ${PROFILES.join(", ")})`
    );
  }
  return catalog.filter((entry) => Array.isArray(entry.profiles) && entry.profiles.includes(effective));
}
var ALLOWED_KINDS = /* @__PURE__ */ new Set(["plugin", "agent", "skill", "support"]);
function validateCatalog({ catalog = CATALOG } = {}) {
  const seenIds = /* @__PURE__ */ new Set();
  const seenPaths = /* @__PURE__ */ new Set();
  const issues = [];
  for (const entry of catalog) {
    if (!entry || typeof entry !== "object") {
      issues.push({ id: null, kind: "shape", message: "catalog entry is not an object" });
      continue;
    }
    const { id, kind, path, source, mode } = entry;
    if (typeof id !== "string" || id.length === 0) {
      issues.push({ id: null, kind: "id", message: `entry id missing: ${JSON.stringify(entry)}` });
    } else if (seenIds.has(id)) {
      issues.push({ id, kind: "duplicate-id", message: `duplicate catalog id: ${id}` });
    } else {
      seenIds.add(id);
    }
    if (typeof path !== "string" || !path.startsWith(".opencode" + sep)) {
      issues.push({ id, kind: "path", message: `path must be rooted under .opencode/: ${path}` });
    }
    if (seenPaths.has(path)) {
      issues.push({ id, kind: "duplicate-path", message: `duplicate target path: ${path}` });
    } else {
      seenPaths.add(path);
    }
    if (!ALLOWED_KINDS.has(kind)) {
      issues.push({ id, kind: "kind", message: `unsupported entry kind: ${kind}` });
    }
    if (typeof source !== "string" || source.length === 0) {
      issues.push({ id, kind: "source", message: `source path missing: ${id}` });
    } else if (!existsSync3(source)) {
      issues.push({ id, kind: "source-missing", message: `source file not found: ${source}` });
    } else {
      try {
        const stats = statSync(source);
        if (!stats.isFile()) {
          issues.push({ id, kind: "source-not-file", message: `source is not a regular file: ${source}` });
        } else if (stats.size === 0) {
          issues.push({ id, kind: "source-empty", message: `source file is empty: ${source}` });
        }
      } catch (e) {
        issues.push({ id, kind: "source-stat", message: `unable to stat source: ${e?.message ?? e}` });
      }
      const rel = relative(packageRoot, source);
      if (rel.startsWith("..")) {
        issues.push({ id, kind: "source-out-of-package", message: `source escapes package root: ${source}` });
      }
    }
    if (mode !== 420) {
      issues.push({ id, kind: "mode", message: `mode must be 0o644: ${id}` });
    }
    if (!Array.isArray(entry.profiles) || entry.profiles.length === 0) {
      issues.push({ id, kind: "profiles", message: `profiles must be a non-empty array: ${id}` });
    } else {
      for (const p of entry.profiles) {
        if (!isValidProfile(p)) {
          issues.push({ id, kind: "profiles", message: `unknown profile in profiles[${entry.profiles.indexOf(p)}]: ${p} (expected one of: ${PROFILES.join(", ")})` });
        }
      }
    }
  }
  if (issues.length > 0) {
    const summary = issues.map((i) => i.message).join("; ");
    const err = new Error(`opencode-ship catalog validation failed: ${summary}`);
    err.issues = issues;
    err.catalogValidation = true;
    throw err;
  }
  return catalog;
}

// src/installer/planner.js
import { existsSync as existsSync7 } from "node:fs";
import { readFile as readFile3, stat } from "node:fs/promises";
init_hash();

// src/installer/config.js
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync as existsSync4 } from "node:fs";
import { dirname as dirname3, resolve as resolve4 } from "node:path";

// schema/ship-config.schema.json
var ship_config_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/Viktorxyz/opencode-ship/schema/ship-config.schema.json",
  title: "opencode-ship user config",
  type: "object",
  required: ["schemaVersion"],
  additionalProperties: false,
  properties: {
    schemaVersion: { enum: [1, 2] },
    profile: {
      type: "string",
      enum: ["core", "engineering"],
      description: "Active profile (precedence layer 2: ship.config > lock > core default)."
    },
    owner: {
      type: "string",
      description: "Optional override for the issue/manifest owner field. Defaults to the agent's local user.name."
    },
    project: {
      type: "object",
      additionalProperties: false,
      properties: {
        remote: { type: "string", minLength: 1 },
        repository: { type: "string", pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$" },
        defaultBranch: { type: "string", minLength: 1 },
        packageManager: { enum: ["npm", "pnpm", "yarn", "bun"] },
        detectOverrides: { type: "boolean", description: "Permit detection to refresh previously persisted values." }
      }
    },
    delivery: {
      type: "object",
      additionalProperties: false,
      properties: {
        worktree: {
          type: "object",
          additionalProperties: false,
          properties: {
            root: { type: "string", minLength: 1 },
            branchTemplate: { type: "string", minLength: 1 },
            bootstrap: {
              type: "array",
              items: {
                type: "array",
                items: { type: "string", minLength: 1 },
                minItems: 1
              }
            }
          }
        },
        verification: {
          type: "object",
          additionalProperties: false,
          properties: {
            commands: {
              type: "array",
              minItems: 1,
              items: {
                type: "object",
                required: ["id", "argv"],
                additionalProperties: false,
                properties: {
                  id: { type: "string", minLength: 1 },
                  argv: {
                    type: "array",
                    items: { type: "string", minLength: 1 },
                    minItems: 1
                  },
                  timeoutMs: { type: "integer", minimum: 1 }
                }
              }
            },
            requireCleanDiffAfter: { type: "boolean" },
            invalidateOnHeadChange: { type: "boolean" }
          }
        },
        review: {
          type: "object",
          additionalProperties: false,
          properties: {
            agent: { type: "string", minLength: 1 },
            required: { type: "boolean" },
            invalidateOnHeadChange: { type: "boolean" }
          }
        },
        ci: {
          type: "object",
          additionalProperties: false,
          properties: {
            driver: { const: "github-status-checks" },
            requiredChecks: {
              type: "array",
              items: { type: "string", minLength: 1 },
              uniqueItems: true
            },
            wait: { type: "boolean" },
            flakyRetry: { type: "integer", enum: [0, 1] }
          }
        },
        ready: {
          type: "object",
          additionalProperties: false,
          properties: {
            requires: {
              type: "array",
              items: { enum: ["review", "local-verification", "remote-ci"] },
              uniqueItems: true
            },
            stopAfterReady: { type: "boolean" }
          }
        },
        merge: {
          type: "object",
          additionalProperties: false,
          properties: {
            strategy: { const: "squash" },
            policy: { const: "explicit-user-request-only" },
            requireFreshGates: { type: "boolean" }
          }
        },
        cleanup: {
          type: "object",
          additionalProperties: false,
          properties: {
            when: { const: "next-task" },
            requireUnpublishedGuard: { type: "boolean" }
          }
        }
      }
    },
    tasks: {
      type: "object",
      description: "Optional override of the managed-file paths. Use only to relocate a target.",
      additionalProperties: false,
      properties: {
        pluginPath: { type: "string", pattern: "^\\.opencode/.+\\.js$" },
        agentsDir: { type: "string", pattern: "^\\.opencode/agents/?$" },
        skillsDir: { type: "string", pattern: "^\\.opencode/skills/?$" }
      }
    },
    workflow: {
      type: "object",
      description: "Required when profile is engineering. Ignored when profile is core.",
      additionalProperties: false,
      properties: {
        models: {
          type: "object",
          additionalProperties: false,
          required: ["planner", "builder", "finalReviewer"],
          properties: {
            planner: {
              type: "string",
              pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$",
              description: "Provider/model id for the strong planning child session."
            },
            builder: {
              type: "string",
              pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$",
              description: "Provider/model id for the cheap builder child session."
            },
            finalReviewer: {
              type: "string",
              pattern: "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$",
              description: "Provider/model id for the final Standards + Spec reviewers."
            }
          }
        },
        approval: {
          type: "object",
          additionalProperties: false,
          properties: {
            mirrorToIssue: { const: true },
            maxFailedRounds: { const: 3 }
          }
        }
      }
    }
  },
  allOf: [
    {
      if: {
        required: ["profile"],
        properties: { profile: { const: "engineering" } }
      },
      then: {
        required: ["workflow"],
        properties: {
          workflow: {
            required: ["models", "approval"],
            properties: {
              models: {
                required: ["planner", "builder", "finalReviewer"]
              },
              approval: {
                required: ["mirrorToIssue", "maxFailedRounds"]
              }
            }
          }
        }
      }
    }
  ]
};

// src/installer/validation.js
var FORMAT_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/;
function isObject2(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function validate(value, schema, pointer, issues) {
  if (!isObject2(schema)) return;
  if (schema.const !== void 0 && value !== schema.const) {
    issues.push(`${pointer}: expected const ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
    return;
  }
  if (schema.enum !== void 0 && !schema.enum.includes(value)) {
    issues.push(`${pointer}: expected one of ${JSON.stringify(schema.enum)}, got ${JSON.stringify(value)}`);
    return;
  }
  if (Array.isArray(schema.allOf)) {
    for (const sub of schema.allOf) validate(value, sub, pointer, issues);
  }
  if (isObject2(schema.if)) {
    const ifIssues = [];
    validate(value, schema.if, pointer, ifIssues);
    if (ifIssues.length === 0) {
      if (isObject2(schema.then)) validate(value, schema.then, pointer, issues);
    } else if (isObject2(schema.else)) {
      validate(value, schema.else, pointer, issues);
    }
  }
  const type = schema.type;
  if (type !== void 0) {
    const actual = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
    if (type !== actual) {
      if (!(type === "integer" && typeof value === "number" && Number.isInteger(value))) {
        issues.push(`${pointer}: expected ${type}, got ${actual}`);
        return;
      }
    }
  }
  if (type === "string") {
    if (schema.minLength !== void 0 && value.length < schema.minLength) {
      issues.push(`${pointer}: shorter than minLength ${schema.minLength}`);
    }
    if (schema.pattern !== void 0) {
      const re = new RegExp(schema.pattern);
      if (!re.test(value)) issues.push(`${pointer}: does not match pattern ${schema.pattern}`);
    }
    if (schema.format === "date-time" && !FORMAT_DATE_TIME.test(value)) {
      issues.push(`${pointer}: not a date-time string`);
    }
  }
  if (type === "integer" || type === "number") {
    if (schema.minimum !== void 0 && value < schema.minimum) {
      issues.push(`${pointer}: less than minimum ${schema.minimum}`);
    }
    if (schema.maximum !== void 0 && value > schema.maximum) {
      issues.push(`${pointer}: greater than maximum ${schema.maximum}`);
    }
    if (schema.enum !== void 0) {
    }
  }
  if (type === "array") {
    if (schema.minItems !== void 0 && value.length < schema.minItems) {
      issues.push(`${pointer}: fewer items than minItems ${schema.minItems}`);
    }
    if (Array.isArray(schema.items)) {
      value.forEach((entry, i) => validate(entry, schema.items[i] ?? {}, `${pointer}/${i}`, issues));
    } else if (schema.items) {
      if (schema.uniqueItems) {
        const seen = /* @__PURE__ */ new Set();
        value.forEach((entry, i) => {
          const key = JSON.stringify(entry);
          if (seen.has(key)) issues.push(`${pointer}/${i}: duplicate unique item`);
          seen.add(key);
        });
      }
      value.forEach((entry, i) => validate(entry, schema.items, `${pointer}/${i}`, issues));
    }
  }
  if (type === "object" || isObject2(schema.properties) || Array.isArray(schema.required)) {
    if (Array.isArray(schema.required)) {
      for (const key of schema.required) {
        if (!(key in value)) issues.push(`${pointer}: missing required field ${key}`);
      }
    }
    if (schema.additionalProperties === false && isObject2(schema.properties)) {
      for (const key of Object.keys(value)) {
        if (!(key in schema.properties)) issues.push(`${pointer}: unknown field ${key}`);
      }
    }
    if (isObject2(schema.properties)) {
      for (const key of Object.keys(schema.properties)) {
        if (key in value) validate(value[key], schema.properties[key], `${pointer}/${key}`, issues);
      }
    }
  }
}
function validateSchema(value, schema) {
  const issues = [];
  validate(value, schema, "#", issues);
  return { ok: issues.length === 0, issues };
}

// src/installer/config.js
init_json_pointer();
init_hash();
function configPath(repoRoot) {
  return resolve4(repoRoot, ".opencode", "ship.config.json");
}
async function loadConfig(repoRoot) {
  const path = configPath(repoRoot);
  if (!existsSync4(path)) return null;
  const raw = await readFile(path, "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: { kind: "parse", path, message: e.message } };
  }
  const validation = validateSchema(parsed, ship_config_schema_default);
  if (!validation.ok) {
    return { ok: false, error: { kind: "contract", path, issues: validation.issues } };
  }
  return {
    ok: true,
    path,
    raw,
    sha256: bytesHashString(raw),
    canonicalSha256: bytesHashString(stableStringify(parsed)),
    value: parsed
  };
}
function renderDefaultConfig(detection, overrides = {}) {
  const pm = detection?.packageManager ?? "npm";
  const safeBootstrap = Array.isArray(detection?.worktreeBootstrap) && detection.worktreeBootstrap.length ? detection.worktreeBootstrap : [["npm", "install"]];
  const safeVerification = Array.isArray(detection?.verificationPlan) && detection.verificationPlan.length ? detection.verificationPlan.map((step) => ({ id: step.id, argv: step.argv })) : [{ id: "typecheck", argv: ["npm", "run", "typecheck"] }];
  const repo = detection?.repository ?? overrides.repository ?? "owner/repo";
  return {
    schemaVersion: 1,
    project: {
      remote: detection?.remote ?? "origin",
      repository: repo,
      defaultBranch: detection?.defaultBranch ?? "main",
      packageManager: pm,
      detectOverrides: false
    },
    delivery: {
      worktree: {
        root: detection?.worktreeRoot ?? ".worktrees",
        branchTemplate: "{actor}/{slug}",
        bootstrap: safeBootstrap
      },
      verification: {
        commands: safeVerification,
        requireCleanDiffAfter: true,
        invalidateOnHeadChange: true
      },
      review: { agent: "delivery-reviewer", required: true, invalidateOnHeadChange: true },
      ci: {
        driver: "github-status-checks",
        requiredChecks: ["delivery-verify"],
        wait: true,
        flakyRetry: 1
      },
      ready: { requires: ["review", "local-verification", "remote-ci"], stopAfterReady: true },
      merge: { strategy: "squash", policy: "explicit-user-request-only", requireFreshGates: true },
      cleanup: { when: "next-task", requireUnpublishedGuard: true }
    }
  };
}

// src/installer/planner.js
init_json_pointer();
init_root_config();

// src/installer/root-reconciliation.js
init_root_config();
init_json_pointer();
init_hash();
init_plan_mode_permissions();
import { existsSync as existsSync6 } from "node:fs";
import { join } from "node:path";
var PLAN_MODE_POINTER2 = "/agent/plan/permission";
function desiredPointersForProfile(profile) {
  const out = POINTER_ENTRIES.map((entry) => ({
    pointer: entry.pointer,
    strategy: (
      /** @type {"value" | "object-entry" | "array-member"} */
      entry.strategy
    ),
    scope: (
      /** @type {Profile} */
      "core"
    ),
    value: entry.value
  }));
  if (profile === "engineering") {
    out.push({
      pointer: PLAN_MODE_POINTER2,
      strategy: (
        /** @type {"value" | "object-entry" | "array-member"} */
        "value"
      ),
      scope: (
        /** @type {Profile} */
        "engineering"
      ),
      value: (
        /** @type {any} */
        planModePermissions().build
      )
    });
  }
  return out;
}
async function planRootReconciliation(input) {
  const profile = input.profile;
  const mode = input.mode;
  if (!["core", "engineering"].includes(profile)) {
    throw new Error(`planRootReconciliation: invalid profile ${profile}`);
  }
  if (!["install", "profile-transition", "uninstall"].includes(mode)) {
    throw new Error(`planRootReconciliation: invalid mode ${mode}`);
  }
  const detected = findRootConfig(input.repoRoot);
  const target = detected.path ?? join(input.repoRoot, detected.relative);
  const descriptors = input.pointerDescriptors ?? desiredPointersForProfile(profile);
  const previousRecords = input.previousRecords ?? [];
  if (mode === "uninstall") {
    return planUninstallRoot({
      target,
      relPath: detected.relative,
      previousRecords,
      previousDocument: input.previousDocument
    });
  }
  const fileMissing = !existsSync6(target);
  if (fileMissing && !input.forceRepair) {
    if (mode === "profile-transition") {
      return {
        kind: "noop",
        op: "root-config",
        target,
        relPath: detected.relative,
        reason: "no root opencode.json present",
        edits: [],
        pointerRecords: reconcileRecordsAfterTransition(descriptors, previousRecords)
      };
    }
    return {
      kind: "noop",
      op: "root-config",
      target,
      relPath: detected.relative,
      reason: "no root opencode.json present",
      edits: [],
      pointerRecords: seedPointerRecords(descriptors, previousRecords)
    };
  }
  let doc;
  if (fileMissing && input.forceRepair) {
    doc = synthesizeDefaultRootConfig();
    if (mode === "install" && profile === "engineering") {
      const applied = applyPlanModeOwnership(doc, { block: planModePermissions().build });
      doc = applied.doc;
    }
    const bytes = Buffer.from(formatRootConfig(doc), "utf8");
    return {
      kind: "create",
      op: "root-config",
      target,
      relPath: detected.relative,
      bytes,
      desiredSha: bytesHashString(stableStringify(doc)),
      currentSha: null,
      edits: descriptors.map((d) => ({ kind: "create", pointer: d.pointer, value: "(synthesized)" })),
      pointerRecords: seedPointerRecords(descriptors, previousRecords),
      format: "json",
      document: doc,
      reason: "creating root opencode.json with installer-owned Build permissions"
    };
  }
  const docResult = readRootConfig(target);
  if (!docResult.ok) {
    return {
      kind: "noop",
      op: "root-config",
      target,
      relPath: detected.relative,
      reason: `root config ${docResult.error.kind}`,
      edits: [],
      pointerRecords: previousRecords
    };
  }
  if (mode === "profile-transition") {
    return planProfileTransitionRoot({
      doc: docResult,
      target,
      relPath: detected.relative,
      descriptors,
      previousRecords
    });
  }
  return planInstallRoot({
    doc: docResult,
    target,
    relPath: detected.relative,
    descriptors,
    previousRecords
  });
}
function reconcileRecordsAfterTransition(descriptors, previousRecords) {
  const desiredCore = new Set(descriptors.filter((d) => d.scope === "core").map((d) => d.pointer));
  const out = previousRecords.filter((r) => r.scope === "core" || r.scope === "engineering" && desiredCore.has(r.pointer));
  const seen = new Set(out.map((r) => r.pointer));
  for (const d of descriptors) {
    if (seen.has(d.pointer)) continue;
    out.push({
      pointer: d.pointer,
      strategy: d.strategy,
      scope: d.scope,
      installedSha256: d.value !== void 0 ? bytesHashString(stableStringify(d.value)) : null,
      previous: { existed: false }
    });
  }
  return out;
}
function planInstallRoot({ doc, target, relPath, descriptors, previousRecords }) {
  const result = applyOwnedPointers(doc.value, {
    pointerEntries: descriptors.map((d) => ({ pointer: d.pointer, strategy: d.strategy, value: d.value })),
    allowEqualValues: true
  });
  const edits = [];
  for (const a of result.applied) edits.push({ kind: "create", pointer: a.pointer, value: a.value });
  for (const s of result.skipped) {
    if (s.reason === "already equal") continue;
    edits.push({ kind: "conflict", pointer: s.pointer, reason: s.reason, existing: s.existing, desired: s.desired });
  }
  let docForWrite = result.doc;
  let bytes;
  try {
    const { value: sourceValue } = parseRootConfigPreservingOrder(doc.raw ?? "");
    if (sourceValue && typeof sourceValue === "object") {
      docForWrite = sourceValue;
      for (const a of result.applied) {
        docForWrite = setPointer(docForWrite, a.pointer, a.value);
      }
    }
    bytes = Buffer.from(formatRootConfigPreserving(docForWrite), "utf8");
  } catch {
    bytes = Buffer.from(formatRootConfig(result.doc), "utf8");
  }
  const records = mergePointerRecords(descriptors, previousRecords, result, doc.before);
  return {
    kind: edits.some((e) => e.kind === "conflict") ? "conflict" : edits.length ? "update" : "noop",
    op: "root-config",
    target,
    relPath,
    bytes,
    desiredSha: bytesHashString(stableStringify(docForWrite)),
    currentSha: doc.sha256 ?? null,
    edits,
    pointerRecords: records,
    format: doc.format,
    document: docForWrite,
    reason: edits.length === 0 ? "no installer-owned entries missing" : `apply ${result.applied.length} / skip ${result.skipped.length}`
  };
}
function planProfileTransitionRoot({ doc, target, relPath, descriptors, previousRecords }) {
  const desired = descriptors;
  const drift = [];
  for (const rec of previousRecords) {
    const stillDesired = desired.some((d) => d.pointer === rec.pointer && d.scope === rec.scope);
    if (stillDesired) continue;
    if (typeof rec.installedSha256 !== "string" || rec.installedSha256.length === 0) continue;
    const currentValue = getPointer(doc.value, rec.pointer);
    if (currentValue === void 0) {
      continue;
    }
    const currentHash = bytesHashString(stableStringify(currentValue));
    if (currentHash !== rec.installedSha256) {
      drift.push({ pointer: rec.pointer, recorded: rec.installedSha256, current: currentHash });
    }
  }
  if (drift.length > 0) {
    return {
      kind: "conflict",
      op: "root-config",
      target,
      relPath,
      reason: `installed pointer drift: ${drift.map((d) => `${d.pointer} (recorded ${d.recorded.slice(0, 8)}\u2026, current ${d.current.slice(0, 8)}\u2026)`).join("; ")}`,
      edits: drift.map((d) => ({ kind: "conflict", pointer: d.pointer, reason: "installed-pointer-drift" })),
      pointerRecords: previousRecords
    };
  }
  let next = JSON.parse(JSON.stringify(doc.value));
  const edits = [];
  const mergedRecords = previousRecords.map((r) => ({ ...r }));
  const recordIndex = new Map(mergedRecords.map((r, idx) => [r.pointer, idx]));
  for (let i = mergedRecords.length - 1; i >= 0; i--) {
    const rec = mergedRecords[i];
    const isStillDesired = desired.some((d) => d.pointer === rec.pointer && d.scope === rec.scope);
    if (isStillDesired) continue;
    if (rec.previous && rec.previous.existed) {
      next = setPointer(next, rec.pointer, rec.previous.value);
      edits.push({ kind: "restore", pointer: rec.pointer, value: rec.previous.value });
    } else {
      if (getPointer(next, rec.pointer) !== void 0) {
        next = removePointer(next, rec.pointer);
        edits.push({ kind: "remove", pointer: rec.pointer });
      }
    }
    mergedRecords.splice(i, 1);
    recordIndex.delete(rec.pointer);
  }
  for (const d of desired) {
    const existing = getPointer(next, d.pointer);
    if (existing === d.value) {
      const idx = recordIndex.get(d.pointer);
      if (idx != null) {
        mergedRecords[idx] = {
          ...mergedRecords[idx],
          scope: d.scope,
          installedSha256: bytesHashString(stableStringify(d.value))
        };
      } else {
        mergedRecords.push({
          pointer: d.pointer,
          strategy: d.strategy,
          scope: d.scope,
          installedSha256: bytesHashString(stableStringify(d.value)),
          previous: { existed: existing !== void 0, value: existing ?? null }
        });
      }
      continue;
    }
    if (existing === void 0) {
      next = setPointer(next, d.pointer, d.value);
      edits.push({ kind: "create", pointer: d.pointer, value: d.value });
      const idx = recordIndex.get(d.pointer);
      if (idx != null) {
        mergedRecords[idx] = {
          ...mergedRecords[idx],
          scope: d.scope,
          installedSha256: bytesHashString(stableStringify(d.value)),
          previous: { existed: false }
        };
      } else {
        mergedRecords.push({
          pointer: d.pointer,
          strategy: d.strategy,
          scope: d.scope,
          installedSha256: bytesHashString(stableStringify(d.value)),
          previous: { existed: false }
        });
      }
    } else {
      edits.push({
        kind: "conflict",
        pointer: d.pointer,
        reason: "different existing value",
        existing,
        desired: d.value
      });
    }
  }
  let docForWrite = next;
  let bytes;
  try {
    const { value: sourceValue } = parseRootConfigPreservingOrder(doc.raw ?? "");
    if (sourceValue && typeof sourceValue === "object") {
      docForWrite = sourceValue;
      for (const e of edits) {
        if (e.kind === "create" || e.kind === "restore") {
          docForWrite = setPointer(docForWrite, e.pointer, e.value);
        } else if (e.kind === "remove") {
          docForWrite = removePointer(docForWrite, e.pointer);
        }
      }
    }
    docForWrite = collapseEmptyAncestors(docForWrite) ?? docForWrite;
    bytes = Buffer.from(formatRootConfigPreserving(docForWrite), "utf8");
  } catch {
    bytes = Buffer.from(formatRootConfig(collapseEmptyAncestors(next) ?? next), "utf8");
  }
  return {
    kind: edits.some((e) => e.kind === "conflict") ? "conflict" : edits.some((e) => e.kind === "create" || e.kind === "remove" || e.kind === "restore") ? "update" : "noop",
    op: "root-config",
    target,
    relPath,
    bytes,
    desiredSha: bytesHashString(stableStringify(docForWrite)),
    currentSha: doc.sha256 ?? null,
    edits,
    pointerRecords: mergedRecords,
    format: doc.format,
    document: docForWrite,
    reason: "profile transition reconciliation"
  };
}
function planUninstallRoot({ target, relPath, previousRecords, previousDocument }) {
  if (previousRecords.length === 0) {
    return {
      kind: "noop",
      op: "root-config",
      target,
      relPath,
      reason: "no installer-owned pointers recorded",
      edits: [],
      pointerRecords: []
    };
  }
  const docResult = readRootConfig(target);
  if (!docResult.ok) {
    return {
      kind: "noop",
      op: "root-config",
      target,
      relPath,
      reason: `root config ${docResult.error.kind}`,
      edits: [],
      pointerRecords: previousRecords
    };
  }
  const drift = [];
  for (const rec of previousRecords) {
    if (typeof rec.installedSha256 !== "string" || rec.installedSha256.length === 0) continue;
    const currentValue = getPointer(docResult.value, rec.pointer);
    if (currentValue === void 0) continue;
    const currentHash = bytesHashString(stableStringify(currentValue));
    if (currentHash !== rec.installedSha256) {
      drift.push({ pointer: rec.pointer, recorded: rec.installedSha256, current: currentHash });
    }
  }
  if (drift.length > 0) {
    return {
      kind: "conflict",
      op: "root-config",
      target,
      relPath,
      reason: `installed pointer drift: ${drift.map((d) => `${d.pointer} (recorded ${d.recorded.slice(0, 8)}\u2026, current ${d.current.slice(0, 8)}\u2026)`).join("; ")}`,
      edits: drift.map((d) => ({ kind: "conflict", pointer: d.pointer, reason: "installed-pointer-drift" })),
      pointerRecords: previousRecords
    };
  }
  let doc = docResult.value;
  const edits = [];
  for (const rec of previousRecords) {
    if (rec.previous && rec.previous.existed) {
      doc = setPointer(doc, rec.pointer, rec.previous.value);
      edits.push({ kind: "restore", pointer: rec.pointer, value: rec.previous.value });
    } else {
      const current = getPointer(doc, rec.pointer);
      if (current !== void 0) {
        doc = removePointer(doc, rec.pointer);
        edits.push({ kind: "remove", pointer: rec.pointer });
      }
    }
  }
  let docForWrite = doc;
  let bytes;
  try {
    const { value: sourceValue } = parseRootConfigPreservingOrder(docResult.raw ?? "");
    if (sourceValue && typeof sourceValue === "object") {
      docForWrite = sourceValue;
      for (const e of edits) {
        if (e.kind === "restore") {
          docForWrite = setPointer(docForWrite, e.pointer, e.value);
        } else if (e.kind === "remove") {
          docForWrite = removePointer(docForWrite, e.pointer);
        }
      }
    }
    docForWrite = collapseEmptyAncestors(docForWrite);
    bytes = Buffer.from(formatRootConfigPreserving(docForWrite), "utf8");
  } catch {
    bytes = Buffer.from(formatRootConfig(collapseEmptyAncestors(doc)), "utf8");
  }
  return {
    kind: edits.length ? "update" : "noop",
    op: "root-config",
    target,
    relPath,
    bytes,
    desiredSha: bytesHashString(stableStringify(docForWrite)),
    currentSha: docResult.sha256 ?? null,
    edits,
    pointerRecords: [],
    format: docResult.format,
    document: docForWrite,
    reason: "uninstall restores the preinstall root config"
  };
}
function collapseEmptyAncestors(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return doc;
  const out = {};
  for (const k of Object.keys(doc)) {
    if (k === "__sourceOrder__") continue;
    out[k] = collapseEmptyAncestors(doc[k]);
  }
  if (Array.isArray(doc.__sourceOrder__)) {
    out.__sourceOrder__ = doc.__sourceOrder__.filter((k) => k in out);
  }
  const remainingKeys = Object.keys(out).filter((k) => k !== "__sourceOrder__");
  if (remainingKeys.length === 0) return void 0;
  return out;
}
function seedPointerRecords(descriptors, previousRecords) {
  const out = previousRecords.map((r) => ({ ...r }));
  const seen = new Set(out.map((r) => r.pointer));
  for (const d of descriptors) {
    if (seen.has(d.pointer)) continue;
    out.push({
      pointer: d.pointer,
      strategy: (
        /** @type {any} */
        d.strategy
      ),
      scope: d.scope,
      installedSha256: d.value !== void 0 ? bytesHashString(stableStringify(d.value)) : null,
      previous: { existed: false }
    });
  }
  return out;
}
function mergePointerRecords(descriptors, previousRecords, result, beforeSnapshot) {
  const out = previousRecords.map((r) => ({ ...r }));
  const index = new Map(out.map((r, idx) => [r.pointer, idx]));
  for (const a of result.applied) {
    const previousEntry = beforeSnapshot?.[a.pointer];
    const previous = previousEntry === void 0 ? { existed: false } : { existed: true, value: previousEntry };
    const next = {
      pointer: a.pointer,
      strategy: "value",
      scope: descriptors.find((d) => d.pointer === a.pointer)?.scope ?? "core",
      installedSha256: bytesHashString(stableStringify(a.value)),
      previous
    };
    if (index.has(a.pointer)) {
      const idx = index.get(a.pointer);
      out[idx] = {
        ...out[idx],
        scope: next.scope,
        installedSha256: next.installedSha256,
        // If the lock already had a record, keep its previous value
        // verbatim so uninstall restores the original pre-install
        // state even after multiple in-place updates.
        previous: out[idx].previous ?? next.previous
      };
    } else {
      out.push(next);
    }
  }
  for (const s of result.skipped) {
    if (s.reason !== "already equal") continue;
    if (index.has(s.pointer)) continue;
    const existing = beforeSnapshot?.[s.pointer];
    const previous = existing === void 0 ? { existed: false } : { existed: true, value: existing };
    out.push({
      pointer: s.pointer,
      strategy: "value",
      scope: descriptors.find((d) => d.pointer === s.pointer)?.scope ?? "core",
      installedSha256: bytesHashString(stableStringify(existing ?? null)),
      previous
    });
  }
  return out;
}

// src/installer/planner.js
async function readBytes(path) {
  if (!existsSync7(path)) return null;
  const buf = await readFile3(path);
  const fileStat = await stat(path);
  return { bytes: buf, hash: bytesHashString(buf.toString("utf8")), mode: fileStat.mode & 511 };
}
async function readDesiredBytes(source) {
  if (!source || !existsSync7(source)) return null;
  const buf = await readFile3(source);
  return { bytes: buf, hash: bytesHashString(buf.toString("utf8")) };
}
function lookupLockedFile(lock, targetPath) {
  if (!lock?.files) return null;
  return lock.files.find((entry) => entry.path === targetPath) ?? null;
}
async function planManagedFile({ entry, repoRoot, lock, allowUnowned }) {
  const targetPath = `${repoRoot}/${entry.path}`;
  const locked = lookupLockedFile(lock, entry.path);
  const current = await readBytes(targetPath);
  const desired = await readDesiredBytes(entry.source);
  if (!current) {
    return {
      kind: "create",
      op: "file",
      target: targetPath,
      relPath: entry.path,
      kindOf: entry.kind,
      bytes: desired?.bytes ?? Buffer.alloc(0),
      sha256: desired?.hash,
      mode: 420,
      reason: "managed file missing"
    };
  }
  if (desired.hash === current.hash) {
    if (locked?.sha256 === current.hash) {
      return { kind: "noop", op: "file", target: targetPath, relPath: entry.path };
    }
    return {
      kind: "converge",
      op: "file",
      target: targetPath,
      relPath: entry.path,
      reason: "current bytes already equal desired; refresh lock only"
    };
  }
  if (locked?.sha256 === current.hash) {
    return {
      kind: "update",
      op: "file",
      target: targetPath,
      relPath: entry.path,
      bytes: desired?.bytes ?? Buffer.alloc(0),
      sha256: desired?.hash,
      mode: 420,
      reason: "safe update: previous lock matches current bytes"
    };
  }
  if (locked?.sha256 && locked.sha256 !== current.hash && allowUnowned) {
    return {
      kind: "update",
      op: "file",
      target: targetPath,
      relPath: entry.path,
      bytes: desired?.bytes ?? Buffer.alloc(0),
      sha256: desired?.hash,
      mode: 420,
      reason: "force update: lock present, current bytes modified"
    };
  }
  return {
    kind: "conflict",
    op: "file",
    target: targetPath,
    relPath: entry.path,
    currentSha: current.hash,
    previousSha: locked?.sha256 ?? null,
    desiredSha: desired?.hash,
    reason: locked?.sha256 == null ? "managed file already exists; bytes differ from upstream" : "managed file is locally modified"
  };
}
async function planFileInstall({ repoRoot, lock, allowUnowned = false, catalog = CATALOG }) {
  const plan = [];
  for (const entry of catalog) {
    plan.push(await planManagedFile({ entry, repoRoot, lock, allowUnowned }));
  }
  return plan;
}
async function planStaleFileRemoval({ repoRoot, lock, staleCatalog }) {
  if (!Array.isArray(staleCatalog) || staleCatalog.length === 0) return [];
  const out = [];
  for (const entry of staleCatalog) {
    const targetPath = `${repoRoot}/${entry.path}`;
    const current = await readBytes(targetPath);
    if (!current) continue;
    const locked = lookupLockedFile(lock, entry.path);
    if (current.hash !== (locked?.sha256 ?? null)) {
      out.push({
        kind: "conflict",
        op: "file",
        target: targetPath,
        relPath: entry.path,
        reason: "stale profile asset is locally modified; refusing to remove"
      });
      continue;
    }
    out.push({
      kind: "delete",
      op: "file",
      target: targetPath,
      relPath: entry.path,
      reason: "remove stale profile asset on profile transition"
    });
  }
  return out;
}
async function planMigrationCleanup({ repoRoot, lock, migrationReport, allowUnowned = false }) {
  const action = migrationReport?.actions?.find((entry) => entry.kind === "candidate-remove-legacy-plugin-path");
  if (!action) return [];
  const relPath = ".opencode/plugin/opencode-ship.js";
  const target = `${repoRoot}/${relPath}`;
  const current = await readBytes(target);
  if (!current) return [];
  const locked = lookupLockedFile(lock, relPath);
  if (locked?.sha256 === current.hash || allowUnowned) {
    return [{
      kind: "delete",
      op: "file",
      target,
      relPath,
      reason: "remove the lock-owned v0.2 singular plugin path"
    }];
  }
  return [{
    kind: "conflict",
    op: "file",
    target,
    relPath,
    currentSha: current.hash,
    previousSha: locked?.sha256 ?? null,
    reason: "legacy singular plugin is unowned or locally modified"
  }];
}
async function planUninstall({ repoRoot, lock }) {
  if (!lock) return [];
  const plan = [];
  const activeProfile = lock?.manager?.profile ?? "core";
  for (const entry of lock.files ?? []) {
    const targetPath = `${repoRoot}/${entry.path}`;
    const current = await readBytes(targetPath);
    if (!current) continue;
    if (current.hash !== entry.sha256) {
      plan.push({
        kind: "conflict",
        op: "file",
        target: targetPath,
        relPath: entry.path,
        reason: "managed file is locally modified; refusing to delete"
      });
      continue;
    }
    plan.push({ kind: "delete", op: "file", target: targetPath, relPath: entry.path });
  }
  const rootPlan = await planRootReconciliation({
    repoRoot,
    profile: activeProfile,
    mode: "uninstall",
    previousRecords: (lock?.manager?.rootDocuments ?? []).flatMap((d) => d.pointers ?? [])
  });
  if (rootPlan?.kind === "conflict") {
    plan.push({
      op: "root-config",
      kind: "conflict",
      target: rootPlan.target,
      relPath: rootPlan.relPath,
      reason: rootPlan.reason
    });
  } else if (rootPlan && rootPlan.kind && rootPlan.kind !== "noop" && rootPlan.bytes) {
    plan.push({
      op: "file",
      kind: "update",
      target: rootPlan.target,
      relPath: rootPlan.relPath,
      bytes: rootPlan.bytes,
      mode: 420,
      reason: rootPlan.reason
    });
  }
  plan.push({
    kind: "delete",
    op: "file",
    target: `${repoRoot}/.opencode/ship.lock.json`,
    relPath: ".opencode/ship.lock.json",
    reason: "remove the install lock inside the transaction"
  });
  return plan;
}
async function planConfigSynthesis({ repoRoot, detection, lock, forceOverwrite, migrationSeed = null, models = null }) {
  const existing = await loadConfig(repoRoot);
  if (existing?.ok && !forceOverwrite) {
    return {
      kind: "noop",
      op: "config",
      relPath: ".opencode/ship.config.json",
      target: existing.path,
      currentSha: existing.sha256,
      desiredSha: existing.sha256,
      configValue: existing.value,
      reason: "user config already present"
    };
  }
  let desiredValue = migrationSeed ?? renderDefaultConfig(detection);
  if (models && (models.planner || models.builder || models.finalReviewer)) {
    const merged = {
      ...desiredValue,
      schemaVersion: 2,
      profile: "engineering",
      workflow: {
        ...desiredValue.workflow ?? {},
        models: {
          planner: models.planner ?? desiredValue?.workflow?.models?.planner,
          builder: models.builder ?? desiredValue?.workflow?.models?.builder,
          finalReviewer: models.finalReviewer ?? desiredValue?.workflow?.models?.finalReviewer
        },
        approval: {
          mirrorToIssue: true,
          maxFailedRounds: 3,
          ...desiredValue?.workflow?.approval ?? {}
        }
      }
    };
    desiredValue = merged;
  }
  const desiredJson = JSON.stringify(desiredValue, null, 2) + "\n";
  const desiredSha = bytesHashString(desiredJson);
  const kind = existing?.ok && forceOverwrite ? "update" : "create";
  const reason = existing?.ok ? "user config overwritten via --force-config" : migrationSeed ? "synthesising a default config from legacy adapter migration" : "synthesising a default config from detection";
  return {
    kind,
    op: "config",
    relPath: ".opencode/ship.config.json",
    target: `${repoRoot}/.opencode/ship.config.json`,
    currentSha: existing?.ok ? existing.sha256 : null,
    desiredSha,
    bytes: Buffer.from(desiredJson, "utf8"),
    configValue: desiredValue,
    reason
  };
}
async function planRootConfigApply({ repoRoot, lock, forceRepair, planMode = null }) {
  const previous = (lock?.manager?.rootDocuments ?? []).flatMap((d) => d.pointers ?? []);
  const previousProfile = lock?.manager?.profile ?? null;
  const desiredProfile = planMode && planMode.scope === "engineering" ? "engineering" : "core";
  const isTransition = previousProfile !== null && previousProfile !== desiredProfile;
  const mode = previous.length === 0 ? "install" : isTransition ? "profile-transition" : "install";
  return planRootReconciliation({
    repoRoot,
    profile: desiredProfile,
    mode,
    previousRecords: previous,
    forceRepair: Boolean(forceRepair)
  });
}

// src/installer/lock.js
init_hash();
init_json_pointer();
import { readFile as readFile4, writeFile as writeFile2, rename as rename2, mkdir as mkdir2 } from "node:fs/promises";
import { existsSync as existsSync8 } from "node:fs";
import { dirname as dirname4, resolve as resolve6 } from "node:path";
var CURRENT_LOCK_SCHEMA = 3;
function lockPath(repoRoot) {
  return resolve6(repoRoot, ".opencode", "ship.lock.json");
}
function computeIntegrity(lock) {
  const { integrity: _ignored, ...without } = lock ?? {};
  void _ignored;
  return {
    lockSha256: bytesHashString(stableStringify(without))
  };
}
function validateLock(rawLock) {
  if (rawLock === null || rawLock === void 0) {
    return { ok: true, kind: "missing", issues: [] };
  }
  if (typeof rawLock !== "object" || Array.isArray(rawLock)) {
    return { ok: false, kind: "shape", issues: ["lock root must be an object"] };
  }
  const issues = [];
  let kind = "ok";
  if (rawLock.contractVersion !== CURRENT_LOCK_SCHEMA && rawLock.contractVersion !== 1 && rawLock.contractVersion !== 2) {
    issues.push(`unsupported contractVersion: ${JSON.stringify(rawLock.contractVersion)} (expected ${CURRENT_LOCK_SCHEMA}, 2, or 1)`);
    kind = "schema";
  }
  const manager = rawLock.manager;
  if (manager === void 0) {
    issues.push("manager section missing");
    kind = kind === "ok" ? "shape" : kind;
  } else if (typeof manager !== "object" || manager === null) {
    issues.push("manager section must be an object");
    kind = kind === "ok" ? "shape" : kind;
  } else if (manager.schemaVersion !== CURRENT_LOCK_SCHEMA && manager.schemaVersion !== 2 && manager.schemaVersion !== 1) {
    issues.push(`unsupported manager.schemaVersion: ${JSON.stringify(manager.schemaVersion)} (expected ${CURRENT_LOCK_SCHEMA}, 2, or 1)`);
    kind = "schema";
  } else if (manager.name !== "opencode-ship") {
    issues.push(`unknown manager.name: ${JSON.stringify(manager.name)}`);
    kind = "shape";
  } else if (rawLock.contractVersion >= 2 && manager.schemaVersion >= 2 && manager.profile !== void 0 && !isValidProfile(manager.profile)) {
    issues.push(`invalid manager.profile: ${JSON.stringify(manager.profile)} (expected one of: core, engineering)`);
    kind = "shape";
  }
  if (!rawLock.files || !Array.isArray(rawLock.files)) {
    issues.push("files must be an array");
    kind = kind === "ok" ? "shape" : kind;
  }
  if (!rawLock.integrity || typeof rawLock.integrity !== "object") {
    issues.push("integrity section missing");
    kind = kind === "ok" ? "shape" : kind;
  } else {
    const expected = computeIntegrity(rawLock).lockSha256;
    if (expected !== rawLock.integrity.lockSha256) {
      issues.push(`integrity mismatch: stored ${rawLock.integrity.lockSha256} != computed ${expected}`);
      kind = "integrity";
    }
  }
  return { ok: issues.length === 0, kind, issues };
}
async function readValidatedLock(repoRoot) {
  const path = lockPath(repoRoot);
  if (!existsSync8(path)) {
    return { kind: "missing", lock: null, issues: [] };
  }
  let raw;
  try {
    const text = await readFile4(path, "utf8");
    raw = JSON.parse(text);
  } catch (e) {
    return {
      kind: "integrity",
      lock: null,
      issues: [`unable to parse lock JSON: ${e?.message ?? String(e)}`]
    };
  }
  const validation = validateLock(raw);
  return { kind: validation.kind, lock: validation.ok ? raw : null, issues: validation.issues };
}

// src/installer/executor.js
init_hash();
init_json_pointer();

// src/installer/detection/project.js
import { spawnSync } from "node:child_process";
import { existsSync as existsSync9, readFileSync as readFileSync4 } from "node:fs";
import { resolve as resolve7, join as join2 } from "node:path";
function runGit(cwd, args) {
  const r = spawnSync("git", ["-C", cwd, ...args], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  });
  return { status: r.status ?? -1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}
function detectPackageManager(repoRoot) {
  if (existsSync9(join2(repoRoot, "pnpm-lock.yaml"))) return "pnpm";
  if (existsSync9(join2(repoRoot, "yarn.lock"))) return "yarn";
  if (existsSync9(join2(repoRoot, "bun.lockb"))) return "bun";
  if (existsSync9(join2(repoRoot, "package-lock.json"))) return "npm";
  return null;
}
function readPackageJson(repoRoot) {
  const path = join2(repoRoot, "package.json");
  if (!existsSync9(path)) return null;
  try {
    return JSON.parse(readFileSync4(path, "utf8"));
  } catch {
    return null;
  }
}
function planFromScripts(pkg, packageManager) {
  const scripts = pkg?.scripts ?? {};
  const runner = packageManager === "npm" ? "npm" : packageManager || "npm";
  const candidate = (name) => typeof scripts[name] === "string" ? scripts[name].trim() : null;
  if (candidate("verify") || candidate("verify:workspace")) {
    const name = candidate("verify:workspace") ? "verify:workspace" : "verify";
    const cmd = candidate(name);
    return [{ id: "canonical", argv: [runner, "run", name], inferredFrom: "verify", command: cmd }];
  }
  const steps = [];
  if (candidate("typecheck")) steps.push({ id: "typecheck", argv: [runner, "run", "typecheck"], script: "typecheck" });
  if (candidate("lint")) steps.push({ id: "lint", argv: [runner, "run", "lint"], script: "lint" });
  if (candidate("test")) steps.push({ id: "test", argv: [runner, "run", "test"], script: "test" });
  return steps;
}
function bootstrapFor(packageManager) {
  if (packageManager === "pnpm") return [["pnpm", "install", "--frozen-lockfile"]];
  if (packageManager === "yarn") return [["yarn", "install", "--frozen-lockfile"]];
  if (packageManager === "bun") return [["bun", "install", "--frozen-lockfile"]];
  if (packageManager === "npm") return [["npm", "ci"]];
  return [];
}
function parseRepoSlugFromRemote(url) {
  if (!url) return null;
  const ssh = url.match(/^git@[^:]+:(.+?)(?:\.git)?$/);
  if (ssh) return ssh[1].replace(/^\/+|\/+$/g, "");
  const https = url.match(/^https?:\/\/[^/]+\/(.+?)(?:\.git)?$/);
  if (https) return https[1].replace(/^\/+|\/+$/g, "");
  return null;
}
function detectRemote(repoRoot) {
  const remotes = runGit(repoRoot, ["remote", "-v"]);
  if (remotes.status !== 0) return { candidates: [], primary: null };
  const lines = remotes.stdout.split("\n").filter(Boolean);
  const map = /* @__PURE__ */ new Map();
  for (const line of lines) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
    if (!match) continue;
    const name = match[1];
    const url = match[2];
    if (!map.has(name)) map.set(name, { name, url });
  }
  const list = Array.from(map.values());
  const origin = list.find((r) => r.name === "origin") ?? list[0] ?? null;
  return { candidates: list, primary: origin };
}
function detectDefaultBranch(repoRoot, remoteName) {
  const head = runGit(repoRoot, ["symbolic-ref", `refs/remotes/${remoteName}/HEAD`]);
  if (head.status === 0) {
    const ref = head.stdout.trim();
    const match = ref.match(/^refs\/remotes\/[^/]+\/(.+)$/);
    if (match) return match[1];
  }
  const local = runGit(repoRoot, ["remote", "show", remoteName]);
  if (local.status === 0) {
    const match = local.stdout.match(/HEAD branch:\s*(\S+)/);
    if (match) return match[1];
  }
  const branch = runGit(repoRoot, ["branch", "--list"]);
  if (branch.status === 0 && /\*\s*main\b/.test(branch.stdout)) return "main";
  return null;
}
function detectOwner(repoRoot) {
  const user = runGit(repoRoot, ["config", "--get", "user.name"]);
  if (user.status === 0 && user.stdout.trim()) return user.stdout.trim();
  const fallback = process.env.USER ?? process.env.USERNAME ?? "opencode-ship";
  return fallback;
}
function detectProject(repoRoot = process.cwd()) {
  const errors = [];
  const cwd = resolve7(repoRoot);
  const inside = runGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (inside.status !== 0) {
    errors.push({ kind: "not-a-git-repo", path: cwd, detail: inside.stderr.trim() });
    return { repoRoot: cwd, errors };
  }
  const repoRootActual = inside.stdout.trim();
  const headBranch = runGit(repoRootActual, ["symbolic-ref", "--short", "HEAD"]);
  if (headBranch.status !== 0 || headBranch.stdout.trim().length === 0) {
    errors.push({ kind: "detached-head", path: repoRootActual, detail: headBranch.stderr.trim() });
  }
  const remote = detectRemote(repoRootActual);
  let repository = null;
  let defaultBranch = null;
  if (remote.primary) {
    repository = parseRepoSlugFromRemote(remote.primary.url);
    defaultBranch = detectDefaultBranch(repoRootActual, remote.primary.name);
  }
  if (!repository) {
    errors.push({ kind: "no-remote", path: repoRootActual, detail: "no usable remote for github detection" });
  }
  if (!defaultBranch) {
    defaultBranch = "main";
  }
  const packageJson = readPackageJson(repoRootActual);
  const packageManager = detectPackageManager(repoRootActual);
  const verificationPlan = planFromScripts(packageJson, packageManager);
  const worktreeBootstrap = bootstrapFor(packageManager);
  const owner = detectOwner(repoRootActual);
  return {
    repoRoot: repoRootActual,
    repository,
    defaultBranch,
    remote: remote.primary?.name ?? null,
    remoteCandidates: remote.candidates,
    packageManager,
    packageJson,
    verificationPlan,
    worktreeBootstrap,
    worktreeRoot: ".worktrees",
    owner,
    headBranch: headBranch.stdout.trim() || null,
    errors
  };
}

// src/installer/executor.js
init_root_config();

// src/installer/transaction.js
import {
  writeFile as writeFile4,
  rename as rename4,
  readFile as readFile6,
  unlink as unlink2,
  mkdir as mkdir4,
  stat as stat3,
  open
} from "node:fs/promises";
import { existsSync as existsSync11 } from "node:fs";
import { dirname as dirname6, resolve as resolve10, join as join5 } from "node:path";
init_hash();

// src/state/git-common-dir.js
import { spawn } from "node:child_process";
import { resolve as resolve8, join as join3 } from "node:path";
var STATE_DIRNAME = "opencode-ship";
async function resolveGitCommonDir(repoRoot) {
  if (typeof repoRoot !== "string" || repoRoot.length === 0) {
    throw new Error("resolveGitCommonDir: repoRoot must be a non-empty string");
  }
  return new Promise((resolveP, reject) => {
    const proc = spawn(
      "git",
      ["-C", repoRoot, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { stdio: ["ignore", "pipe", "pipe"], shell: false }
    );
    let out = "";
    let err = "";
    proc.stdout.on("data", (d) => {
      out += d.toString("utf8");
    });
    proc.stderr.on("data", (d) => {
      err += d.toString("utf8");
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(
          `git rev-parse --git-common-dir failed (exit ${code}): ${err.trim() || "unknown error"}`
        ));
        return;
      }
      const trimmed = out.trim();
      if (!trimmed) {
        reject(new Error("git rev-parse --git-common-dir returned an empty path"));
        return;
      }
      resolveP(resolve8(repoRoot, trimmed));
    });
  });
}
function opencodeShipStateDir(commonDir, ...segments) {
  if (typeof commonDir !== "string" || commonDir.length === 0) {
    throw new Error("opencodeShipStateDir: commonDir must be a non-empty string");
  }
  return join3(commonDir, STATE_DIRNAME, ...segments);
}

// src/state/durable-store.js
import {
  open as fsOpen,
  writeFile as writeFile3,
  readFile as readFile5,
  rename as rename3,
  link,
  mkdir as mkdir3,
  readdir,
  unlink,
  stat as stat2
} from "node:fs/promises";
import { existsSync as existsSync10 } from "node:fs";
import { dirname as dirname5, join as join4, resolve as resolve9 } from "node:path";
import { createHash as createHash2, randomBytes } from "node:crypto";
import { hostname as osHostname } from "node:os";
var STALE_LOCK_MS = 120 * 1e3;
function randomToken() {
  return randomBytes(8).toString("hex");
}
function ensureString(value) {
  return JSON.stringify(value, null, 2) + "\n";
}
async function fsyncDir(path) {
  try {
    const handle = await fsOpen(path, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
  }
}
async function atomicReplaceJson(path, value) {
  if (typeof path !== "string" || path.length === 0) {
    throw new Error("atomicReplaceJson: path must be a non-empty string");
  }
  const target = resolve9(path);
  const parent = dirname5(target);
  await mkdir3(parent, { recursive: true });
  const tmp = `${target}.${randomToken()}.tmp`;
  const handle = await fsOpen(tmp, "w", 384);
  try {
    await handle.writeFile(ensureString(value), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename3(tmp, target);
  await fsyncDir(parent);
}

// src/installer/transaction.js
function lockDirFromCommonDir(commonDir) {
  return opencodeShipStateDir(commonDir);
}
async function lockDirForRepo(repoRoot) {
  const commonDir = await resolveGitCommonDir(repoRoot);
  return lockDirFromCommonDir(commonDir);
}
function transactionLockPath(lockDir) {
  return resolve10(lockDir, ".txn.lock");
}
function journalPath(lockDir, txnId) {
  return resolve10(lockDir, `.txn-${txnId}.journal`);
}
function backupPath(target, token) {
  return `${target}.txn-${token}-backup`;
}
function stagedPath(target, token) {
  return `${target}.txn-${token}-staged`;
}
async function mkdirp(path) {
  await mkdir4(path, { recursive: true });
}
async function acquireLock(lockDir, txnId) {
  await mkdirp(lockDir);
  const path = transactionLockPath(lockDir);
  const handle = await open(path, "wx", 384);
  try {
    await handle.writeFile(JSON.stringify({
      pid: process.pid,
      txnId,
      startedAt: (/* @__PURE__ */ new Date()).toISOString()
    }));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fsyncDir2(lockDir);
}
async function releaseLock(lockDir) {
  try {
    await unlink2(transactionLockPath(lockDir));
  } catch {
  }
}
async function liveLockOwner(lockDir) {
  const path = transactionLockPath(lockDir);
  if (!existsSync11(path)) return false;
  try {
    const lock = JSON.parse(await readFile6(path, "utf8"));
    if (!Number.isInteger(lock?.pid) || lock.pid <= 0) return false;
    process.kill(lock.pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}
async function fsyncDir2(path) {
  try {
    const handle = await open(path, "r");
    await handle.sync();
    await handle.close();
  } catch {
  }
}
function randomToken2() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function asMode(mode) {
  return typeof mode === "number" ? mode : 420;
}
async function writeJournal(lockDir, txnId, journal) {
  const { entries, ...header } = journal;
  const json = { ...header, ledger: entries.map((entry) => ({
    op: entry.op,
    target: entry.target,
    backup: entry.backup ?? null,
    staged: entry.staged ?? null,
    hadOriginal: entry.hadOriginal ?? null,
    commitMarker: entry.commitMarker ?? false,
    installedSha256: entry.installedSha256 ?? null,
    mode: entry.mode ?? null
  })) };
  await atomicReplaceJson(journalPath(lockDir, txnId), json);
}
async function clearJournal(lockDir, txnId) {
  if (!txnId) return;
  try {
    await unlink2(journalPath(lockDir, txnId));
  } catch {
  }
}
async function readJournal(lockDir, name) {
  const path = resolve10(lockDir, name);
  let raw;
  try {
    raw = await readFile6(path, "utf8");
  } catch (err) {
    throw new Error(`transaction journal unreadable: ${path}: ${err?.message ?? err}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`transaction journal malformed JSON: ${path}: ${err?.message ?? err}`);
  }
  if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.ledger)) {
    throw new Error(`transaction journal missing ledger: ${path}`);
  }
  return parsed;
}
async function isCommitted(journal) {
  if (journal.committed) return true;
  const marker = journal.ledger?.find((entry) => entry.commitMarker);
  if (!marker?.target || !marker.installedSha256 || !existsSync11(marker.target)) return false;
  try {
    return bytesHashString(await readFile6(marker.target, "utf8")) === marker.installedSha256;
  } catch {
    return false;
  }
}
async function restoreEntry(entry) {
  if (entry.op === "write") {
    if (entry.backup && existsSync11(entry.backup)) {
      await rename4(entry.backup, entry.target);
    } else if (entry.hadOriginal === false && existsSync11(entry.target)) {
      await unlink2(entry.target);
    }
    if (entry.staged && existsSync11(entry.staged)) await unlink2(entry.staged);
  } else if (entry.op === "delete" && entry.backup && existsSync11(entry.backup)) {
    await rename4(entry.backup, entry.target);
  }
  await fsyncDir2(dirname6(entry.target));
}
async function recoverJournal(lockDir, name) {
  let journal;
  try {
    journal = await readJournal(lockDir, name);
  } catch (err) {
    return { ok: false, error: err };
  }
  const committed = await isCommitted(journal);
  const entries = committed ? journal.ledger ?? [] : [...journal.ledger ?? []].reverse();
  let complete = true;
  for (const entry of entries) {
    try {
      if (committed) await commitEntry(entry);
      else await restoreEntry(entry);
    } catch {
      complete = false;
    }
  }
  if (complete) await unlink2(resolve10(lockDir, name)).catch(() => null);
  return { ok: complete };
}
async function recover(repoRoot, lockDir) {
  if (!existsSync11(lockDir)) return { recovered: false, recoveredCount: 0 };
  if (await liveLockOwner(lockDir)) {
    return { recovered: false, recoveredCount: 0, blocked: true };
  }
  const { readdir: readdir2 } = await import("node:fs/promises");
  const names = await readdir2(lockDir).catch(() => []);
  const journals = names.filter((n) => n.startsWith(".txn-") && n.endsWith(".journal"));
  if (!journals.length) {
    await releaseLock(lockDir);
    return { recovered: false, recoveredCount: 0 };
  }
  let totalRecovered = 0;
  let recoveryFailed = false;
  let recoveryError = null;
  for (const name of journals) {
    const result = await recoverJournal(lockDir, name);
    if (!result.ok) {
      recoveryFailed = true;
      if (result.error) recoveryError = result.error.message ?? String(result.error);
    } else {
      totalRecovered += 1;
    }
  }
  await releaseLock(lockDir);
  return {
    recovered: totalRecovered > 0,
    recoveredCount: totalRecovered,
    blocked: recoveryFailed,
    reason: recoveryFailed ? "recovery-failed" : null,
    recoveryError
  };
}
async function commitEntry(entry) {
  let changed = false;
  if (entry.backup && existsSync11(entry.backup)) {
    await unlink2(entry.backup);
    changed = true;
  }
  if (entry.staged && existsSync11(entry.staged)) {
    await unlink2(entry.staged);
    changed = true;
  }
  if (changed) await fsyncDir2(dirname6(entry.target));
}
async function executePlan({ repoRoot, plan, newLockBuilder }) {
  const lockDir = await lockDirForRepo(repoRoot);
  const recovered = await recover(repoRoot, lockDir);
  if (recovered.blocked) {
    const kind = recovered.reason ?? "lock-held";
    const message = kind === "lock-held" ? "another opencode-ship transaction is active" : `a previous opencode-ship transaction could not be recovered: ${recovered.recoveryError ?? "unknown error"}`;
    return { ok: false, error: { kind, message } };
  }
  const txnId = `txn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    await acquireLock(lockDir, txnId);
  } catch (e) {
    return { ok: false, error: { kind: "lock-held", message: e?.message ?? String(e) } };
  }
  const journal = { repoRoot, txnId, startedAt: (/* @__PURE__ */ new Date()).toISOString(), entries: [] };
  try {
    await writeJournal(lockDir, txnId, journal);
    for (const op of plan) {
      if (op.op !== "file") continue;
      if (op.kind === "conflict" || op.kind === "noop" || op.kind === "converge") continue;
      const token = randomToken2();
      const backup = backupPath(op.target, token);
      const staged = stagedPath(op.target, token);
      if (op.kind === "delete") {
        if (!existsSync11(op.target)) continue;
        journal.entries.push({
          op: "delete",
          target: op.target,
          backup,
          staged: null,
          hadOriginal: true,
          mode: asMode(op.mode)
        });
        await writeJournal(lockDir, txnId, journal);
        await rename4(op.target, backup);
      } else {
        await mkdirp(dirname6(op.target));
        const hadOriginal = existsSync11(op.target);
        journal.entries.push({
          op: "write",
          target: op.target,
          backup: hadOriginal ? backup : null,
          staged,
          hadOriginal,
          mode: asMode(op.mode)
        });
        await writeJournal(lockDir, txnId, journal);
        await writeFile4(staged, op.bytes ?? Buffer.alloc(0), { mode: asMode(op.mode) });
        const h = await open(staged, "r+");
        await h.sync();
        await h.close();
        if (hadOriginal) await rename4(op.target, backup);
        await rename4(staged, op.target);
      }
      await fsyncDir2(dirname6(op.target));
    }
    if (newLockBuilder) {
      const lockValue = await newLockBuilder();
      const lockPathTarget = `${repoRoot}/.opencode/ship.lock.json`;
      await mkdirp(dirname6(lockPathTarget));
      const token = randomToken2();
      const backup = backupPath(lockPathTarget, token);
      const staged = stagedPath(lockPathTarget, token);
      const hadOriginal = existsSync11(lockPathTarget);
      const finalLock = { ...lockValue, integrity: computeIntegrity(lockValue) };
      const lockBytes = JSON.stringify(finalLock, null, 2) + "\n";
      journal.entries.push({
        op: "write",
        target: lockPathTarget,
        backup: hadOriginal ? backup : null,
        staged,
        hadOriginal,
        commitMarker: true,
        installedSha256: bytesHashString(lockBytes),
        mode: 420
      });
      await writeJournal(lockDir, txnId, journal);
      await writeFile4(staged, lockBytes, { mode: 420 });
      const handle = await open(staged, "r+");
      await handle.sync();
      await handle.close();
      if (hadOriginal) await rename4(lockPathTarget, backup);
      await rename4(staged, lockPathTarget);
      await fsyncDir2(dirname6(lockPathTarget));
    }
    journal.committed = true;
    await writeJournal(lockDir, txnId, journal);
    let cleanupComplete = true;
    for (const entry of journal.entries) {
      try {
        await commitEntry(entry);
      } catch {
        cleanupComplete = false;
      }
    }
    if (cleanupComplete) await clearJournal(lockDir, txnId);
    return {
      ok: true,
      txnId,
      recovered: recovered.recovered ?? false,
      recoveredCount: recovered.recoveredCount ?? 0,
      cleanupPending: !cleanupComplete
    };
  } catch (e) {
    await rollback(lockDir, journal);
    return { ok: false, error: { kind: "transaction-failed", message: e?.message ?? String(e) } };
  } finally {
    await releaseLock(lockDir);
  }
}
async function rollback(lockDir, journal) {
  const entries = journal.entries ?? journal.ledger ?? [];
  let complete = true;
  for (const entry of [...entries].reverse()) {
    try {
      await restoreEntry(entry);
    } catch {
      complete = false;
    }
  }
  if (complete && journal.txnId) await clearJournal(lockDir, journal.txnId);
}

// src/installer/migration.js
import { readFile as readFile7 } from "node:fs/promises";
import { existsSync as existsSync12 } from "node:fs";
import { resolve as resolve11 } from "node:path";
function legacyAdapterPath(repoRoot) {
  return resolve11(repoRoot, ".opencode", "delivery.json");
}
function legacyLockPath(repoRoot) {
  return resolve11(repoRoot, ".opencode", "delivery.lock.json");
}
function legacyPluginPath(repoRoot) {
  return resolve11(repoRoot, ".opencode", "plugin", "delivery.ts");
}
async function detectLegacyShapes(repoRoot) {
  const out = {
    adapter: false,
    legacyLock: false,
    plugin: false,
    pluginOld: false,
    reviewer: false,
    verifier: false
  };
  if (existsSync12(legacyAdapterPath(repoRoot))) out.adapter = true;
  if (existsSync12(legacyLockPath(repoRoot))) out.legacyLock = true;
  if (existsSync12(legacyPluginPath(repoRoot))) out.plugin = true;
  if (existsSync12(resolve11(repoRoot, ".opencode/plugin/opencode-ship.js"))) out.pluginOld = true;
  if (existsSync12(resolve11(repoRoot, ".opencode/agents/delivery-reviewer.md"))) out.reviewer = true;
  if (existsSync12(resolve11(repoRoot, ".opencode/agents/delivery-verifier.md"))) out.verifier = true;
  return out;
}
async function readLegacyAdapter(repoRoot) {
  const path = legacyAdapterPath(repoRoot);
  if (!existsSync12(path)) return null;
  try {
    const raw = await readFile7(path, "utf8");
    return { path, raw, value: JSON.parse(raw) };
  } catch {
    return null;
  }
}
async function migration({ repoRoot, lock, forceRepair, detection = null }) {
  const shapes = await detectLegacyShapes(repoRoot);
  const legacy = await readLegacyAdapter(repoRoot);
  const config = await loadConfig(repoRoot);
  const actions = [];
  let proposedConfigSeed = null;
  if (legacy && !config?.ok) {
    proposedConfigSeed = legacyToShipConfig(legacy.value, detection);
    actions.push({ kind: "candidate-seed-config", from: legacy.path });
  }
  if (legacy && shapes.legacyLock && !lock?.manager) {
    actions.push({ kind: "kept-legacy-lock", path: legacyLockPath(repoRoot) });
  }
  if (shapes.plugin && existsSync12(resolve11(repoRoot, ".opencode/plugins/opencode-ship.js"))) {
    if (!forceRepair) {
      actions.push({ kind: "candidate-remove-legacy-plugin", path: legacyPluginPath(repoRoot) });
    }
  }
  if (shapes.pluginOld) {
    actions.push({ kind: "candidate-remove-legacy-plugin-path", path: resolve11(repoRoot, ".opencode/plugin/opencode-ship.js") });
  }
  return { shapes, actions, legacyPresent: Boolean(legacy), proposedConfigSeed };
}
function legacyToShipConfig(legacy, detection = null) {
  if (!legacy || typeof legacy !== "object") return renderDefaultConfig(detection ?? {});
  const repoSlug = typeof legacy.repository?.repoSlug === "string" ? legacy.repository.repoSlug : detection?.repository ?? "owner/repo";
  return {
    schemaVersion: 1,
    project: {
      remote: legacy.repository?.remote ?? detection?.remote ?? "origin",
      repository: repoSlug,
      defaultBranch: legacy.repository?.defaultBranch?.name ?? detection?.defaultBranch ?? "main",
      packageManager: detection?.packageManager ?? "pnpm",
      detectOverrides: false
    },
    delivery: {
      worktree: {
        root: legacy.worktree?.root ?? ".worktrees",
        branchTemplate: legacy.worktree?.branchTemplate ?? "{actor}/{slug}",
        bootstrap: Array.isArray(legacy.worktree?.bootstrap) && legacy.worktree.bootstrap.length ? legacy.worktree.bootstrap : [["pnpm", "install", "--frozen-lockfile"]]
      },
      verification: {
        commands: Array.isArray(legacy.verification?.commands) && legacy.verification.commands.length ? legacy.verification.commands : [{ id: "canonical", argv: ["pnpm", "verify:workspace"], timeoutMs: 18e5 }],
        requireCleanDiffAfter: legacy.verification?.requireCleanDiffAfter ?? true,
        invalidateOnHeadChange: legacy.verification?.invalidateOnHeadChange ?? true
      },
      review: legacy.review ?? { agent: "delivery-reviewer", required: true, invalidateOnHeadChange: true },
      ci: legacy.ci ?? {
        driver: "github-status-checks",
        requiredChecks: ["delivery-verify"],
        wait: true,
        flakyRetry: 1
      },
      ready: legacy.ready ?? { requires: ["review", "local-verification", "remote-ci"], stopAfterReady: true },
      merge: legacy.merge ?? { strategy: "squash", policy: "explicit-user-request-only", requireFreshGates: true },
      cleanup: legacy.cleanup && typeof legacy.cleanup === "object" && "when" in legacy.cleanup ? legacy.cleanup : { when: "next-task", requireUnpublishedGuard: true }
    }
  };
}

// src/installer/executor.js
init_plan_mode_permissions();
async function readCurrentBytes(targetPath) {
  if (!existsSync13(targetPath)) return null;
  const buf = await readFile8(targetPath);
  return { bytes: buf, hash: bytesHashString(buf.toString("utf8")) };
}
async function previewInstall({ rootPath, profile = null, replaceManaged, forceConfig, forceRootConfig, models = null }) {
  const detection = detectProject(rootPath ?? process.cwd());
  if (detection.errors.some((e) => e.kind === "not-a-git-repo")) {
    return { ok: false, error: { kind: "invalid-project", errors: detection.errors } };
  }
  const repoRoot = detection.repoRoot;
  const validatedLock = await readValidatedLock(repoRoot);
  if (validatedLock.kind === "schema") {
    return { ok: false, error: { kind: "unsupported-lock-schema", issues: validatedLock.issues } };
  }
  if (validatedLock.kind === "integrity" || validatedLock.kind === "shape") {
    return { ok: false, error: { kind: "lock-invalid", issues: validatedLock.issues } };
  }
  const lock = validatedLock.lock;
  const migrationReport = await migration({ repoRoot, lock, forceRepair: false, detection });
  const configResult = await loadConfig(repoRoot);
  const configValue = configResult?.ok ? configResult.value : null;
  const resolved = resolveProfile({
    cli: profile,
    config: configValue,
    lock
  });
  if (resolved.profile === "engineering") {
    const candidate = await planConfigSynthesis({
      repoRoot,
      detection,
      lock,
      forceOverwrite: Boolean(forceConfig),
      migrationSeed: migrationReport?.proposedConfigSeed ?? null,
      models
    });
    if (candidate.kind === "create" || candidate.kind === "update") {
      const configValue2 = candidate.configValue;
      if (!configValue2.workflow || !configValue2.workflow.models) {
        return { ok: false, error: { kind: "engineering-models-required", message: "engineering profile requires workflow.models.{planner,builder,finalReviewer}" } };
      }
      const { planner, builder, finalReviewer } = configValue2.workflow.models;
      if (!planner || !builder || !finalReviewer) {
        return { ok: false, error: { kind: "engineering-models-required", message: "all three workflow.models.* are required" } };
      }
      if (!configValue2.workflow.approval || !configValue2.workflow.approval.mirrorToIssue || configValue2.workflow.approval.maxFailedRounds !== 3) {
        return { ok: false, error: { kind: "engineering-approval-required", message: "engineering profile requires workflow.approval.{mirrorToIssue:true, maxFailedRounds:3}" } };
      }
    }
  }
  const previousProfile = lock?.manager?.profile ?? null;
  const isProfileTransition = previousProfile && previousProfile !== resolved.profile;
  const activeCatalog = filterCatalogByProfile(CATALOG, resolved.profile);
  const staleCatalog = isProfileTransition ? filterCatalogByProfile(CATALOG, previousProfile).filter((e) => !activeCatalog.includes(e)) : [];
  const configPlan = await planConfigSynthesis({
    repoRoot,
    detection,
    lock,
    forceOverwrite: Boolean(forceConfig),
    migrationSeed: migrationReport?.proposedConfigSeed ?? null
  });
  const filePlan = await planFileInstall({ repoRoot, lock, allowUnowned: Boolean(replaceManaged), catalog: activeCatalog });
  const staleFilePlan = await planStaleFileRemoval({ repoRoot, lock, staleCatalog });
  const migrationPlan = await planMigrationCleanup({
    repoRoot,
    lock,
    migrationReport,
    allowUnowned: Boolean(replaceManaged)
  });
  const planMode = resolved.profile === "engineering" ? { id: "/agent/plan/permission", block: planModePermissions().build, scope: "engineering" } : null;
  const rootPlan = await planRootConfigApply({ repoRoot, lock, forceRepair: Boolean(forceRootConfig), planMode });
  const plan = [...filePlan ?? [], ...staleFilePlan, ...migrationPlan, configPlan, rootPlan];
  const conflicts = plan.filter((p) => p && p.kind === "conflict");
  const summary = summarise(plan);
  return {
    ok: true,
    repoRoot,
    detection,
    lock,
    profile: resolved,
    previousProfile,
    isProfileTransition,
    plan,
    conflicts,
    summary,
    migrationReport
  };
}
async function previewUninstall({ rootPath }) {
  const detection = detectProject(rootPath ?? process.cwd());
  if (detection.errors.some((e) => e.kind === "not-a-git-repo")) {
    return { ok: false, error: { kind: "invalid-project" } };
  }
  const repoRoot = detection.repoRoot;
  const validatedLock = await readValidatedLock(repoRoot);
  if (validatedLock.kind === "schema") {
    return { ok: false, error: { kind: "unsupported-lock-schema", issues: validatedLock.issues } };
  }
  if (validatedLock.kind === "integrity" || validatedLock.kind === "shape") {
    return { ok: false, error: { kind: "lock-invalid", issues: validatedLock.issues } };
  }
  const lock = validatedLock.lock;
  if (!lock) {
    return { ok: true, repoRoot, lock: null, plan: [], conflicts: [], summary: summarise([]) };
  }
  const plan = await planUninstall({ repoRoot, lock });
  const conflicts = plan.filter((p) => p.kind === "conflict");
  return { ok: true, repoRoot, lock, plan, conflicts, summary: summarise(plan) };
}
function summarise(plan) {
  const counts = { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0, lock: 0, config: 0, rootConfig: 0 };
  for (const op of plan) {
    if (!op) continue;
    if (op.op === "lock") counts.lock += 1;
    else if (op.op === "config") counts.config += 1;
    else if (op.op === "root-config") counts.rootConfig += 1;
    else if (counts[op.kind] !== void 0) counts[op.kind] += 1;
  }
  return counts;
}
async function assembleLock({ repoRoot, plan, lock, configPlan, rootPlan, profile = null }) {
  const files = [];
  const remain = lock?.files?.filter((f) => !plan.some((op) => op?.relPath === f.path)) ?? [];
  for (const op of plan) {
    if (!op || op.op !== "file") continue;
    if (op.kind === "delete" || op.kind === "conflict") continue;
    const entry = CATALOG.find((c) => c.path === op.relPath);
    if (!entry) continue;
    let hash = op.sha256;
    if (!hash && op.target) {
      const cur = await readCurrentBytes(op.target);
      if (cur) hash = cur.hash;
    }
    files.push({
      path: op.relPath,
      sha256: hash ?? null,
      mode: 420,
      template: relativeTemplate(entry.source),
      kind: entry.kind
    });
  }
  for (const f of remain) {
    files.push({ ...f });
  }
  const configSha = configPlan?.kind === "create" || configPlan?.kind === "update" ? configPlan.desiredSha : configPlan?.kind === "noop" ? configPlan.currentSha : null;
  const rootPointers = rootPlan?.pointerRecords ?? lock?.manager?.rootDocuments?.[0]?.pointers ?? [];
  const hasRootPlan = Boolean(rootPlan?.target || rootPlan?.pointerRecords && rootPlan.pointerRecords.length > 0);
  const hasRootDocuments = rootPlan?.pointerRecords && rootPlan.pointerRecords.length > 0 || lock?.manager?.rootDocuments && lock.manager.rootDocuments.length > 0;
  return {
    contractVersion: CURRENT_LOCK_SCHEMA,
    manager: {
      schemaVersion: CURRENT_LOCK_SCHEMA,
      name: "opencode-ship",
      version: "0.10.0-rc.1",
      templateSet: TEMPLATE_SET_ID,
      // Newly written locks always carry the resolved profile so
      // future CLI invocations without --profile still resolve to
      // the same choice through the lock-precedence layer.
      profile: profile ?? lock?.manager?.profile,
      appliedAt: (/* @__PURE__ */ new Date()).toISOString(),
      config: {
        path: ".opencode/ship.config.json",
        sha256: configSha ?? lock?.manager?.config?.sha256 ?? "",
        existed: Boolean(lock?.manager?.config?.existed)
      },
      rootDocuments: hasRootDocuments && (hasRootPlan || (lock?.manager?.rootDocuments?.length ?? 0) > 0) ? [{
        path: rootPlan?.relPath ?? lock?.manager?.rootDocuments?.[0]?.path ?? "opencode.json",
        format: rootPlan?.format ?? lock?.manager?.rootDocuments?.[0]?.format ?? "json",
        pointers: rootPlan?.pointerRecords && rootPlan.pointerRecords.length > 0 ? rootPlan.pointerRecords : lock?.manager?.rootDocuments?.[0]?.pointers ?? []
      }] : []
    },
    files,
    cleanupPending: lock?.cleanupPending ?? []
  };
}
async function commitInstall(preview, { json, command }) {
  if (!preview.ok) {
    return {
      ok: false,
      command,
      plan: [],
      conflicts: [],
      summary: summarise([]),
      diagnostics: [preview.error?.kind ?? "invalid-project"],
      /** @type {any} */
      extra: { exitCode: 2, repoRoot: null, migrationReport: null }
    };
  }
  const { repoRoot, plan, conflicts, migrationReport } = preview;
  const filePlans = plan.filter((op) => op.op === "file");
  const configPlan = plan.find((op) => op.op === "config");
  const rootPlan = plan.find((op) => op.op === "root-config");
  const fileOnly = filePlans;
  if (conflicts.length > 0) {
    return {
      ok: false,
      command,
      plan,
      conflicts,
      summary: summarise(plan),
      diagnostics: ["hash conflict; refuse to overwrite"],
      /** @type {any} */
      extra: { exitCode: 3, repoRoot, migrationReport }
    };
  }
  const newLockObject = await assembleLock({
    repoRoot,
    plan: fileOnly,
    lock: preview.lock,
    configPlan,
    rootPlan,
    profile: preview.profile?.profile
  });
  const txPlan = await stageFiles(fileOnly, repoRoot);
  if (configPlan && (configPlan.kind === "create" || configPlan.kind === "update")) {
    txPlan.push({
      op: "file",
      kind: configPlan.kind === "create" ? "create" : "update",
      target: configPlan.target,
      bytes: configPlan.bytes,
      mode: 420,
      relPath: configPlan.relPath
    });
  }
  if (rootPlan && (rootPlan.kind === "create" || rootPlan.kind === "update")) {
    txPlan.push({
      op: "file",
      kind: rootPlan.kind,
      target: rootPlan.target,
      bytes: rootPlan.bytes,
      mode: 420,
      relPath: rootPlan.relPath
    });
  }
  const tx = await executePlan({
    repoRoot,
    plan: txPlan,
    newLockBuilder: async () => newLockObject
  });
  if (!tx.ok) {
    return {
      ok: false,
      command,
      plan,
      conflicts: [],
      summary: summarise(plan),
      diagnostics: [tx.error?.message ?? "transaction failure"],
      extra: { exitCode: 4, repoRoot, migrationReport, recovered: false }
    };
  }
  return {
    ok: true,
    command,
    plan,
    conflicts: [],
    summary: summarise(plan),
    diagnostics: [],
    extra: { exitCode: 0, repoRoot, migrationReport, recovered: tx.recovered }
  };
}
async function stageFiles(filePlan, repoRoot) {
  const out = [];
  for (const op of filePlan) {
    if (op.kind === "conflict" || op.kind === "noop" || op.kind === "converge") continue;
    if (op.kind === "delete") {
      out.push({
        op: "file",
        kind: "delete",
        target: op.target,
        relPath: op.relPath
      });
      continue;
    }
    out.push({
      op: "file",
      kind: op.kind,
      target: op.target,
      bytes: op.bytes ?? Buffer.alloc(0),
      mode: op.mode ?? 420
    });
  }
  return out;
}
function serializePlan(plan) {
  return plan.filter(Boolean).map((op) => {
    if (!op) return null;
    const { bytes, ...rest } = op;
    if (bytes && Buffer.isBuffer(bytes)) {
      return { ...rest, bytesLength: bytes.length };
    }
    return rest;
  });
}
function relativeTemplate(source) {
  if (typeof source !== "string") return source;
  const prefix = `${process.cwd()}/`;
  if (source.startsWith(prefix)) return source.slice(prefix.length);
  return source;
}

// src/installer/commands/doctor.js
import { existsSync as existsSync14, readFileSync as readFileSync5 } from "node:fs";
import { spawnSync as spawnSync2 } from "node:child_process";
init_hash();
import { resolve as resolve13 } from "node:path";
init_root_config();

// src/installer/report.js
var REPORT_VERSION = 1;
function pad(p) {
  return p.replace(/^/, "  ");
}
function summarise2(plan) {
  const counts = { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0 };
  for (const op of plan) {
    if (counts[op.kind] !== void 0) counts[op.kind] += 1;
  }
  return counts;
}
function renderHuman({ command, plan, conflicts, summary, diagnostics = [] }) {
  const head = `# opencode-ship ${command}`;
  if (!plan.length && !conflicts.length) {
    return [head, "", "No changes.", ...diagnostics.map((d) => pad(`- ${d}`))].join("\n");
  }
  const sections = [head, "", `## Plan`];
  for (const op of plan) {
    sections.push(pad(`- ${op.kind.padEnd(9)} ${op.relPath ?? op.target}${op.reason ? ` \u2014 ${op.reason}` : ""}`));
  }
  if (conflicts.length) {
    sections.push("", `## Conflicts (${conflicts.length})`);
    for (const c of conflicts) {
      sections.push(pad(`- ${c.relPath ?? c.target}: ${c.reason}`));
    }
  }
  if (diagnostics.length) {
    sections.push("", "## Diagnostics");
    for (const d of diagnostics) sections.push(pad(`- ${d}`));
  }
  sections.push("", `Summary: ${JSON.stringify(summary)}`);
  return sections.join("\n");
}
function renderJson({ command, plan, conflicts, summary, diagnostics = [], exitCode }) {
  return JSON.stringify({
    reportVersion: REPORT_VERSION,
    command,
    status: conflicts.length > 0 ? "conflict" : "ok",
    plan,
    conflicts,
    summary,
    diagnostics,
    exitCode
  }, null, 2);
}

// src/installer/commands/doctor.js
function checkNode() {
  return { name: "node>=22.6.0", ok: /^v2[2-9]/.test(process.version), detail: process.version };
}
function checkGit() {
  const r = spawnSync2("git", ["--version"], { encoding: "utf8" });
  return { name: "git installed", ok: r.status === 0, detail: r.status === 0 ? r.stdout.trim() : "git not on PATH" };
}
function checkGh() {
  const r = spawnSync2("gh", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return { name: "gh installed", ok: r.status === 0, detail: r.status === 0 ? r.stdout.trim() : "gh CLI not on PATH" };
}
function checkGhAuth() {
  const envToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!envToken) {
    return { name: "gh auth status", ok: false, detail: "no GH_TOKEN / GITHUB_TOKEN in environment; gh auth skipped" };
  }
  const r = spawnSync2("gh", ["auth", "status"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return {
    name: "gh auth status",
    ok: r.status === 0,
    detail: r.status === 0 ? "authenticated (token)" : (r.stderr || r.stdout || "").trim() || "no session"
  };
}
function checkPackageIntegrity() {
  try {
    validateCatalog();
    return { name: "package integrity", ok: true, detail: `${CATALOG.length} catalog entries` };
  } catch (e) {
    return {
      name: "package integrity",
      ok: false,
      detail: `${e?.message ?? e}: ${(e?.issues ?? []).map((i) => i.message).join("; ")}`
    };
  }
}
function buildSourceHashIndex() {
  const idx = /* @__PURE__ */ new Map();
  for (const entry of CATALOG) {
    if (!existsSync14(entry.source)) continue;
    try {
      const buf = readFileSync5(entry.source, "utf8");
      idx.set(entry.source, bytesHashString(buf));
    } catch {
    }
  }
  return idx;
}
function checkCatalogInstall(repoRoot, sourceHashes, profile) {
  const rows = [];
  const scoped = profile ? filterCatalogByProfile(CATALOG, profile) : CATALOG;
  for (const entry of scoped) {
    const target = resolve13(repoRoot, entry.path);
    if (!existsSync14(target)) {
      rows.push(`${entry.id}: missing`);
      continue;
    }
    try {
      const buf = readFileSync5(target, "utf8");
      const actual = bytesHashString(buf);
      const expected = sourceHashes.get(entry.source);
      if (expected && expected !== actual) {
        rows.push(`${entry.id}: drift`);
      } else {
        rows.push(`${entry.id}: ok`);
      }
    } catch (e) {
      rows.push(`${entry.id}: ${e?.message ?? e}`);
    }
  }
  const allOk = rows.length === 0 || rows.every((r) => r.endsWith("ok"));
  return {
    name: `catalog assets present (${profile ?? "core"})`,
    ok: allOk,
    detail: rows.join(",")
  };
}
async function checkLock(repoRoot) {
  const result = await readValidatedLock(repoRoot);
  if (result.kind === "missing") {
    return { name: "lock present", ok: false, detail: "no lock" };
  }
  if (result.kind === "schema") {
    return { name: "lock present", ok: false, detail: `unsupported schema: ${result.issues.join("; ")}` };
  }
  if (result.kind === "integrity") {
    return { name: "lock present", ok: false, detail: `integrity: ${result.issues.join("; ")}` };
  }
  if (result.kind === "shape") {
    return { name: "lock present", ok: false, detail: `malformed: ${result.issues.join("; ")}` };
  }
  const lock = result.lock;
  return {
    name: "lock present",
    ok: true,
    detail: `manager@${lock.manager?.version ?? "?"} schema=${lock.manager?.schemaVersion ?? "?"}`
  };
}
async function checkConfig(repoRoot) {
  const r = await loadConfig(repoRoot);
  return {
    name: "ship.config.json valid",
    ok: Boolean(r?.ok),
    detail: r?.ok ? "loaded" : r?.error?.kind ?? "missing"
  };
}
async function checkManagedHashes(repoRoot, validatedLock) {
  if (validatedLock.kind !== "ok" || !validatedLock.lock) {
    return { name: "managed hashes", ok: false, detail: "no usable lock" };
  }
  const drift = [];
  for (const entry of validatedLock.lock.files ?? []) {
    const p = resolve13(repoRoot, entry.path);
    if (!existsSync14(p)) {
      drift.push(`missing:${entry.path}`);
      continue;
    }
    const buf = readFileSync5(p, "utf8");
    const actual = bytesHashString(buf);
    if (actual !== entry.sha256) drift.push(`drift:${entry.path}`);
  }
  return { name: "managed hashes", ok: drift.length === 0, detail: drift.length ? drift.join(",") : "match" };
}
async function checkActiveProfileFootprint(repoRoot, validatedLock, profile) {
  if (validatedLock.kind !== "ok" || !validatedLock.lock) {
    return { name: "profile footprint", ok: true, detail: "no lock; n/a" };
  }
  if (!profile) {
    return { name: "profile footprint", ok: true, detail: "no profile; n/a" };
  }
  const expectedPaths = new Set(
    filterCatalogByProfile(CATALOG, profile).map((e) => e.path)
  );
  const present = (validatedLock.lock.files ?? []).filter((f) => expectedPaths.has(f.path)).map((f) => f.path);
  const missing = [...expectedPaths].filter((p) => !present.includes(p));
  return {
    name: "profile footprint",
    ok: missing.length === 0,
    detail: missing.length ? `missing profile assets: ${missing.join(",")}` : `${present.length}/${expectedPaths.size} present`
  };
}
async function checkRootConfig(repoRoot) {
  const { findRootConfig: findRootConfig2 } = await Promise.resolve().then(() => (init_root_config(), root_config_exports));
  const candidate = findRootConfig2(repoRoot);
  if (!candidate.path) return { name: "root config owned entries", ok: true, detail: "absent (no work)" };
  const result = readRootConfig(candidate.path);
  if (!result.ok) return { name: "root config owned entries", ok: false, detail: `root config ${result.error.kind}` };
  const r = applyOwnedPointers(result.value);
  const conflict = r.skipped.find((s) => s.reason === "different existing value");
  return {
    name: "root config owned entries",
    ok: !conflict,
    detail: conflict ? `conflict on ${conflict.pointer}` : `applied=${r.applied.length}, skipped=${r.skipped.length}`
  };
}
function writeEnvelope({ command, plan, summary, diagnostics, json, exitCode }) {
  const conflicts = plan.filter((p) => p.kind === "conflict");
  if (json) {
    process.stdout.write(renderJson({ command, plan, conflicts, summary, diagnostics, exitCode }) + "\n");
  } else {
    process.stdout.write(renderHuman({ command, plan, conflicts, summary, diagnostics }) + "\n");
  }
}
async function runDoctor({ rootPath, profile, json, writeOutput = true }) {
  const detection = detectProject(rootPath ?? process.cwd());
  if (detection.errors.some((e) => e.kind === "not-a-git-repo")) {
    const issues2 = ["not in a git repository"];
    const checks2 = [];
    const plan2 = checks2.map((c) => ({
      kind: c.ok ? "noop" : "conflict",
      op: "check",
      target: c.name,
      relPath: c.name,
      reason: c.detail
    }));
    const summary2 = summarise2(plan2);
    if (writeOutput) writeEnvelope({ command: "doctor", plan: plan2, summary: summary2, diagnostics: issues2, json, exitCode: 2 });
    process.exitCode = 2;
    return { issues: issues2, exitCode: 2, plan: plan2, checks: checks2 };
  }
  const repoRoot = detection.repoRoot;
  const sourceHashes = buildSourceHashIndex();
  const validatedLock = await readValidatedLock(repoRoot);
  const packageIntegrity = checkPackageIntegrity();
  const configResult = await loadConfig(repoRoot);
  const configValue = configResult?.ok ? configResult.value : null;
  const resolved = resolveProfile({
    cli: profile,
    config: configValue,
    lock: validatedLock.lock
  });
  const checks = [
    checkNode(),
    checkGit(),
    checkGh(),
    checkGhAuth(),
    packageIntegrity,
    checkCatalogInstall(repoRoot, sourceHashes, resolved.profile),
    await checkLock(repoRoot),
    await checkConfig(repoRoot),
    await checkManagedHashes(repoRoot, validatedLock),
    await checkActiveProfileFootprint(repoRoot, validatedLock, resolved.profile),
    await checkRootConfig(repoRoot)
  ];
  const issues = checks.filter((c) => !c.ok).map((c) => `${c.name}: ${c.detail}`);
  const plan = checks.map((c) => ({
    kind: c.ok ? "noop" : "conflict",
    op: "check",
    target: c.name,
    relPath: c.name,
    reason: c.detail
  }));
  const summary = summarise2(plan);
  let exitCode = 1;
  if (issues.length === 0) exitCode = 0;
  if (!packageIntegrity.ok) exitCode = 4;
  if (validatedLock.kind === "schema") exitCode = 5;
  if (writeOutput) writeEnvelope({ command: "doctor", plan, summary, diagnostics: issues, json, exitCode });
  process.exitCode = exitCode;
  return { issues, exitCode, plan, checks, profile: resolved };
}

// src/installer/commands/init.js
async function runInit(options) {
  try {
    validateCatalog();
  } catch (e) {
    if (e?.catalogValidation) {
      return emitFailure(4, `catalog validation failed: ${e.message}`, options.json, "init");
    }
    throw e;
  }
  const preview = await previewInstall({
    rootPath: options.rootPath ?? null,
    profile: options.profile ?? null,
    replaceManaged: false,
    forceConfig: Boolean(options.forceConfig),
    forceRootConfig: Boolean(options.forceRootConfig),
    models: options.models ?? null
  });
  if (!preview.ok) {
    if (preview.error?.kind === "unsupported-lock-schema") {
      return emitFailure(5, `unsupported lock schema: ${(preview.error.issues ?? []).join("; ")}`, options.json, "init");
    }
    if (preview.error?.kind === "engineering-models-required") {
      return emitFailure(2, preview.error.message, options.json, "init");
    }
    if (preview.error?.kind === "engineering-approval-required") {
      return emitFailure(2, preview.error.message, options.json, "init");
    }
    if (preview.error?.kind === "lock-invalid") {
      return emitFailure(3, `lock invalid: ${(preview.error.issues ?? []).join("; ")}`, options.json, "init");
    }
    return emitFailure(2, preview.error?.kind ?? "invalid-project", options.json, "init");
  }
  const committed = await commitInstall(preview, { json: options.json, command: "init" });
  let exitCode = committed.extra?.exitCode ?? 0;
  if (!committed || exitCode !== 0) {
    if (exitCode === 2) return emitFailure(2, committed?.diagnostics?.[0] ?? "invalid project", options.json, "init");
    if (exitCode === 3) return emitFailure(3, committed?.diagnostics?.[0] ?? "conflict", options.json, "init");
    if (exitCode === 4) return emitFailure(4, committed?.diagnostics?.[0] ?? "transaction failure", options.json, "init");
    return emitFailure(exitCode, committed?.diagnostics?.[0] ?? "unknown", options.json, "init");
  }
  const doctor = await runDoctor({
    rootPath: options.rootPath ?? null,
    profile: options.profile ?? null,
    json: Boolean(options.json),
    writeOutput: false
  });
  committed.extra = { ...committed.extra ?? {}, doctor: { issues: doctor.issues, checks: doctor.checks, exitCode: doctor.exitCode } };
  committed.diagnostics = [...committed.diagnostics ?? [], ...doctor.issues ?? []];
  if (doctor.issues && doctor.issues.length > 0) {
    committed.diagnostics = [`doctor: ${doctor.issues.length} check(s) unhealthy`, ...committed.diagnostics];
    if (options.strictDoctor) {
      exitCode = 1;
    }
  }
  if (options.json) {
    const envelope = {
      reportVersion: 1,
      command: "init",
      status: exitCode === 0 ? "ok" : "warning",
      plan: serializePlan(committed.plan ?? []),
      conflicts: committed.conflicts ?? [],
      summary: committed.summary ?? {},
      diagnostics: committed.diagnostics ?? [],
      doctor: doctor.issues ?? [],
      doctorChecks: doctor.checks ?? [],
      exitCode
    };
    Object.assign(envelope, committed.extra ?? {}, { doctor: doctor.issues ?? [] });
    process.stdout.write(JSON.stringify(envelope, null, 2) + "\n");
  } else if (exitCode !== 0) {
    process.stdout.write(`opencode-ship: doctor reported ${doctor.issues.length} unhealthy check(s)
`);
  } else {
    process.stdout.write(`opencode-ship: installed; doctor OK
`);
  }
  process.exitCode = exitCode;
  return { ok: exitCode === 0, exitCode };
}
function emitFailure(code, message, json, command) {
  if (json) {
    process.stdout.write(JSON.stringify({
      reportVersion: 1,
      command,
      status: "error",
      plan: [],
      conflicts: [],
      summary: { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0 },
      diagnostics: [message],
      exitCode: code
    }, null, 2) + "\n");
  } else {
    process.stdout.write(`opencode-ship: ${message}
`);
  }
  process.exitCode = code;
  return { ok: false, exitCode: code };
}

// src/installer/commands/diff.js
function summarise3(plan) {
  const counts = { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0, lock: 0, config: 0, rootConfig: 0 };
  for (const op of plan) {
    if (!op) continue;
    if (op.op === "lock") counts.lock += 1;
    else if (op.op === "config") counts.config += 1;
    else if (op.op === "root-config") counts.rootConfig += 1;
    else if (counts[op.kind] !== void 0) counts[op.kind] += 1;
  }
  return counts;
}
function serializePlan2(plan) {
  return plan.filter(Boolean).map((op) => {
    if (!op) return null;
    const { bytes, ...rest } = op;
    if (bytes && Buffer.isBuffer(bytes)) {
      return { ...rest, bytesLength: bytes.length };
    }
    return rest;
  });
}
async function runDiff(options) {
  try {
    validateCatalog();
  } catch (e) {
    if (e?.catalogValidation) {
      if (options.json) {
        process.stdout.write(JSON.stringify({
          reportVersion: 1,
          command: "diff",
          status: "error",
          plan: [],
          conflicts: [],
          summary: { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0 },
          diagnostics: [`catalog validation failed: ${e.message}`],
          exitCode: 4
        }, null, 2) + "\n");
      } else {
        process.stdout.write(`opencode-ship: catalog validation failed: ${e.message}
`);
      }
      process.exitCode = 4;
      return { ok: false, exitCode: 4 };
    }
    throw e;
  }
  const preview = await previewInstall({
    rootPath: options.rootPath ?? null,
    profile: options.profile ?? null,
    replaceManaged: false,
    forceConfig: false,
    forceRootConfig: false
  });
  if (!preview.ok) {
    const exitCode = preview.error?.kind === "unsupported-lock-schema" ? 5 : preview.error?.kind === "lock-invalid" ? 3 : 2;
    const message = preview.error?.kind === "lock-invalid" ? `lock invalid: ${(preview.error.issues ?? []).join("; ")}` : preview.error?.kind === "unsupported-lock-schema" ? `unsupported lock schema: ${(preview.error.issues ?? []).join("; ")}` : preview.error?.kind ?? "invalid-project";
    if (options.json) {
      process.stdout.write(JSON.stringify({
        reportVersion: 1,
        command: "diff",
        status: "error",
        plan: [],
        conflicts: [],
        summary: { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0 },
        diagnostics: [message],
        exitCode
      }, null, 2) + "\n");
    } else {
      process.stdout.write(`opencode-ship: ${message}
`);
    }
    process.exitCode = exitCode;
    return { ok: false, exitCode };
  }
  const { plan, conflicts, migrationReport } = preview;
  const summary = summarise3(plan);
  const changes = summary.create + summary.update + summary.delete + summary.conflict;
  if (options.json) {
    process.stdout.write(JSON.stringify({
      reportVersion: 1,
      command: "diff",
      status: conflicts.length > 0 ? "conflict" : changes ? "changed" : "noop",
      plan: serializePlan2(plan),
      conflicts,
      summary,
      diagnostics: [],
      migrationReport,
      exitCode: changes ? 1 : 0
    }, null, 2) + "\n");
  } else {
    const head = "# opencode-ship diff";
    const lines = [head, "", "## Plan"];
    for (const op of plan.filter(Boolean)) {
      const bytesHint = (
        /** @type {any} */
        op.bytes ? `${/** @type {any} */
        op.bytes.length ?? 0}b` : ""
      );
      lines.push(`  - ${op.kind.padEnd(9)} ${op.op} ${op.relPath ?? op.target}${bytesHint ? ` (${bytesHint})` : ""}${op.reason ? ` \u2014 ${op.reason}` : ""}`);
    }
    if (conflicts.length) {
      lines.push("", `## Conflicts (${conflicts.length})`);
      for (const c of conflicts) lines.push(`  - ${c.relPath ?? c.target}: ${c.reason}`);
    }
    lines.push("", `Summary: ${JSON.stringify(summary)}`);
    process.stdout.write(lines.join("\n") + "\n");
  }
  process.exitCode = changes ? 1 : 0;
  return { ok: true, exitCode: changes ? 1 : 0 };
}

// src/installer/commands/update.js
async function runUpdate(options) {
  try {
    validateCatalog();
  } catch (e) {
    if (e?.catalogValidation) {
      return emitFailure2(4, `catalog validation failed: ${e.message}`, options.json, "update");
    }
    throw e;
  }
  const preview = await previewInstall({
    rootPath: options.rootPath,
    profile: options.profile ?? null,
    replaceManaged: options.replaceManaged,
    forceConfig: options.forceConfig,
    forceRootConfig: options.forceRootConfig
  });
  if (!preview.ok) {
    if (preview.error?.kind === "unsupported-lock-schema") {
      return emitFailure2(5, `unsupported lock schema: ${(preview.error.issues ?? []).join("; ")}`, options.json, "update");
    }
    if (preview.error?.kind === "lock-invalid") {
      return emitFailure2(3, `lock invalid: ${(preview.error.issues ?? []).join("; ")}`, options.json, "update");
    }
    return emitFailure2(2, preview.error?.kind ?? "invalid-project", options.json, "update");
  }
  if (preview.conflicts.length > 0 && !options.replaceManaged) {
    return emitFailure2(3, "modified managed files; rerun with --replace-managed", options.json, "update");
  }
  const committed = await commitInstall(preview, { json: options.json, command: "update" });
  if (options.json) {
    process.stdout.write(JSON.stringify({
      reportVersion: 1,
      command: "update",
      status: committed.extra?.exitCode === 0 ? "ok" : "error",
      plan: serializePlan(committed.plan ?? []),
      conflicts: committed.conflicts ?? [],
      summary: committed.summary ?? {},
      diagnostics: committed.diagnostics ?? [],
      exitCode: committed.extra?.exitCode ?? 0,
      ...committed.extra ?? {}
    }, null, 2) + "\n");
  } else if (committed.extra?.exitCode === 0) {
    process.stdout.write(`opencode-ship: update OK
`);
  }
  process.exitCode = committed.extra?.exitCode ?? 0;
  return committed;
}
function emitFailure2(code, message, json, command) {
  if (json) {
    process.stdout.write(JSON.stringify({
      reportVersion: 1,
      command,
      status: "error",
      plan: [],
      conflicts: [],
      summary: { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0 },
      diagnostics: [message],
      exitCode: code
    }, null, 2) + "\n");
  } else {
    process.stdout.write(`opencode-ship: ${message}
`);
  }
  process.exitCode = code;
  return { ok: false, exitCode: code };
}

// src/installer/commands/uninstall.js
import { unlink as unlink4 } from "node:fs/promises";
async function runUninstall(options) {
  const preview = await previewUninstall({ rootPath: options.rootPath });
  if (!preview.ok) {
    if (preview.error?.kind === "unsupported-lock-schema") {
      return emitFailure3(5, `unsupported lock schema: ${(preview.error.issues ?? []).join("; ")}`, options.json);
    }
    if (preview.error?.kind === "lock-invalid") {
      return emitFailure3(3, `lock invalid: ${(preview.error.issues ?? []).join("; ")}`, options.json);
    }
    return emitFailure3(2, preview.error?.kind ?? "invalid-project", options.json);
  }
  const { repoRoot, plan, conflicts, summary } = preview;
  if (options.purgeConfig) {
    const cfg = configPath(repoRoot);
    plan.push({
      op: "file",
      kind: "delete",
      target: cfg,
      relPath: ".opencode/ship.config.json",
      reason: "purge user-owned ship.config.json"
    });
  }
  if (conflicts.length > 0) {
    return emitReport(plan, conflicts, summary, options.json, 3, ["modified managed files; refusing to delete"]);
  }
  const tx = await executePlan({ repoRoot, plan, newLockBuilder: null });
  if (!tx.ok) {
    return emitFailure3(4, tx.error?.message ?? "transaction failure", options.json);
  }
  return emitReport(plan, [], summary, options.json, 0, [tx.recovered ? "journal recovered before uninstall" : ""].filter(Boolean));
}
function emitFailure3(code, message, json) {
  if (json) {
    process.stdout.write(JSON.stringify({
      reportVersion: 1,
      command: "uninstall",
      status: "error",
      plan: [],
      conflicts: [],
      summary: { create: 0, update: 0, noop: 0, delete: 0, conflict: 0, converge: 0 },
      diagnostics: [message],
      exitCode: code
    }, null, 2) + "\n");
  } else {
    process.stdout.write(`opencode-ship: ${message}
`);
  }
  process.exitCode = code;
  return { ok: false, exitCode: code };
}
function emitReport(plan, conflicts, summary, json, exitCode, diagnostics) {
  const safePlan = plan.map((op) => {
    const { bytes, ...rest } = op ?? {};
    return bytes && Buffer.isBuffer(bytes) ? { ...rest, bytesLength: bytes.length } : rest;
  });
  if (json) {
    process.stdout.write(JSON.stringify({
      reportVersion: 1,
      command: "uninstall",
      status: conflicts.length > 0 ? "conflict" : exitCode === 0 ? "ok" : "error",
      plan: safePlan,
      conflicts,
      summary,
      diagnostics,
      exitCode
    }, null, 2) + "\n");
  } else {
    const head = "# opencode-ship uninstall";
    const lines = [head, "", "## Plan"];
    for (const op of plan) lines.push(`  - ${op.kind.padEnd(9)} ${op.relPath ?? op.target}${op.reason ? ` \u2014 ${op.reason}` : ""}`);
    if (conflicts.length) {
      lines.push("", `## Conflicts (${conflicts.length})`);
      for (const c of conflicts) lines.push(`  - ${c.relPath ?? c.target}: ${c.reason}`);
    }
    lines.push("", `Summary: ${JSON.stringify(summary)}`);
    process.stdout.write(lines.join("\n") + "\n");
  }
  process.exitCode = exitCode;
  return { ok: true, exitCode };
}

// src/cli.js
var VERSION = PACKAGE_VERSION;
async function main() {
  const parsed = parseCommand(process.argv.slice(2));
  if (parsed.command === "help") {
    process.stdout.write(helpText() + "\n");
    process.exitCode = 0;
    return;
  }
  if (parsed.command === "version") {
    process.stdout.write(`opencode-ship ${VERSION}
`);
    process.exitCode = 0;
    return;
  }
  if ("error" in parsed) {
    process.stderr.write(`opencode-ship: ${parsed.error}

${helpText()}`);
    process.exitCode = 2;
    return;
  }
  const options = parsed.options ?? {};
  const opts = options;
  const profile = opts.profile ?? null;
  const models = {
    planner: opts.plannerModel ?? null,
    builder: opts.builderModel ?? null,
    finalReviewer: opts.finalReviewerModel ?? null
  };
  const hasModels = Boolean(models.planner || models.builder || models.finalReviewer);
  switch (parsed.command) {
    case "init":
      await runInit({
        json: !!opts.json,
        rootPath: opts.rootPath,
        profile,
        forceConfig: !!opts.forceConfig,
        forceRootConfig: !!opts.forceRootConfig,
        strictDoctor: !!opts.strictDoctor,
        models: hasModels ? models : null
      });
      return;
    case "diff":
      await runDiff({ json: !!opts.json, rootPath: opts.rootPath, profile });
      return;
    case "update":
      await runUpdate({
        json: !!opts.json,
        rootPath: opts.rootPath,
        profile,
        replaceManaged: !!opts.replaceManaged,
        forceConfig: !!opts.forceConfig,
        forceRootConfig: !!opts.forceRootConfig,
        models: hasModels ? models : null
      });
      return;
    case "doctor":
      await runDoctor({ json: !!opts.json, rootPath: opts.rootPath, profile });
      return;
    case "uninstall":
      await runUninstall({ json: !!opts.json, rootPath: opts.rootPath, profile, purgeConfig: !!opts.purgeConfig });
      return;
    default:
      process.stdout.write(helpText() + "\n");
      process.exitCode = 2;
  }
}
main().catch((e) => {
  process.stderr.write(`opencode-ship: internal failure: ${e?.message ?? String(e)}
`);
  if (e?.stack) process.stderr.write(e.stack + "\n");
  process.exitCode = 4;
});
