#!/usr/bin/env node
/* eslint-disable no-console */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const tscBin = existsSync("node_modules/.bin/tsc") ? "node_modules/.bin/tsc" : "tsc";

function run(name, cmd) {
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`typecheck: ${name} failed (exit ${r.status})`);
    return false;
  }
  return true;
}

// Syntax check on the package's JS source. We use Node 22's --check
// (no TS needed) to keep this fast and dep-free for the runtime files.
let ok = true;
ok = run("node --check", ["node", "scripts/typecheck-node.mjs"]) && ok;

// Real TypeScript typecheck of the consumer fixture so .d.ts drift
// and JS `no-undef` style bugs surface before the consumer integrates.
ok = run("tsc consumer", [tscBin, "--noEmit", "-p", "tests/fixtures/consumer-tsconfig.json"]) && ok;

if (!ok) process.exit(1);
console.log("typecheck passed (node --check + tsc consumer)");
