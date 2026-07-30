#!/usr/bin/env node
/* eslint-disable no-console */
import { spawnSync } from "node:child_process";

const steps = [
  ["format:check", ["node", "scripts/format-check.mjs"]],
  ["lint", ["node", "scripts/lint.mjs"]],
  ["typecheck", ["node", "scripts/typecheck.mjs"]],
  ["build", ["node", "scripts/build.mjs"]],
  ["test", ["node", "scripts/run-all-tests.mjs"]],
];

let failed = 0;
for (const [name, cmd] of steps) {
  const r = spawnSync(cmd[0], cmd.slice(1), { stdio: "inherit" });
  if (r.status !== 0) {
    console.error(`verify: ${name} failed (exit ${r.status})`);
    failed++;
  }
}
if (failed > 0) process.exit(1);
console.log("verify: all steps passed");
