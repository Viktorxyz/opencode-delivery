#!/usr/bin/env node
/* Discover and run every `*.test.mjs` test under `tests/`. */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TSX = existsSync("node_modules/.bin/tsx") ? "node_modules/.bin/tsx" : "tsx";

function discover(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const st = statSync(path);
    if (st.isDirectory()) {
      discover(path, out);
    } else if (entry.endsWith(".test.mjs")) {
      out.push(path);
    }
  }
  return out.sort();
}

const tests = discover("tests");
if (tests.length === 0) {
  console.error("no tests found under tests/");
  process.exit(1);
}
const r = spawnSync("node", [TSX, "--test", "--test-concurrency=1", "--test-reporter=spec", "--tsconfig", "tsconfig.json", ...tests], {
  stdio: "inherit",
});
process.exit(r.status ?? 1);
