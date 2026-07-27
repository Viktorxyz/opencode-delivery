#!/usr/bin/env node
/* eslint-disable no-console */
import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

async function* walk(dir) {
  for (const name of await readdir(dir, { withFileTypes: true })) {
    const p = resolve(dir, name.name);
    if (name.isDirectory()) {
      if (name.name === "node_modules" || name.name === ".git") continue;
      yield* walk(p);
    } else {
      yield p;
    }
  }
}

let bad = 0;
try {
  await stat("src");
} catch {
  console.error("typecheck failed: src directory not found");
  process.exit(2);
}
for await (const file of walk(resolve("src"))) {
  if (!(file.endsWith(".js") || file.endsWith(".mjs"))) continue;
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (r.status !== 0) {
    console.error(`syntax error in ${file}:\n${r.stderr}`);
    bad++;
  }
}
if (bad > 0) {
  console.error(`typecheck failed: ${bad} file(s) with syntax errors`);
  process.exit(1);
}
console.log("node --check passed");
