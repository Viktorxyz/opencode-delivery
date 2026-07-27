#!/usr/bin/env node
/* eslint-disable no-console */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const tscBin = existsSync("node_modules/.bin/tsc") ? "node_modules/.bin/tsc" : "tsc";

function run(name, cmd) {
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`typecheck: ${name} failed (exit ${r.status})`);
    return false;
  }
  return true;
}

// 1. Syntax check on the package's JS source. We use Node 22's --check
//    (no TS needed) to keep this fast and dep-free for the runtime files.
let ok = true;
ok = run("node --check", ["node", "scripts/typecheck-node.mjs"]) && ok;

// 2. Real TypeScript typecheck of the consumer fixture so .d.ts drift
//    and JS `no-undef` style bugs surface before the consumer integrates.
ok = run("tsc consumer", [tscBin, "--noEmit", "-p", "tests/fixtures/consumer-tsconfig.json"]) && ok;

// 3. Strict JS typecheck of the package's own runtime surface so that
//    undefined identifiers, wrong arity, and .d.ts / runtime drift in
//    src/**/*.{js,mjs} surface before merge. Strict mode + checkJs +
//    allowJs catches the `no-undef` category that node --check misses.
//    Uses the repo-root tsconfig.source.json so include paths resolve
//    relative to the project root, not relative to a transient file.
ok = run("tsc source", [tscBin, "--noEmit", "-p", "tsconfig.source.json"]) && ok;

if (!ok) process.exit(1);
console.log("typecheck passed (node --check + tsc consumer + tsc source)");
