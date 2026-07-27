#!/usr/bin/env node
/* eslint-disable no-console */
import { readFile, readdir, stat } from "node:fs/promises";
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

async function main() {
  let bad = 0;
  for (const root of ["src", "tests", "scripts", "agents", "skills"]) {
    let exists = true;
    try {
      await stat(root);
    } catch {
      exists = false;
    }
    if (!exists) continue;
    for await (const file of walk(resolve(root))) {
      if (!(file.endsWith(".js") || file.endsWith(".mjs") || file.endsWith(".ts"))) continue;
      const text = await readFile(file, "utf8");
      if (!text.endsWith("\n")) {
        console.error(`${file}: missing trailing newline`);
        bad++;
      }
      if (text.includes("\t")) {
        console.error(`${file}: contains tab character`);
        bad++;
      }
      if (text.includes("\r")) {
        console.error(`${file}: contains CR`);
        bad++;
      }
    }
  }
  if (bad > 0) {
    console.error(`format-check failed: ${bad} issue(s)`);
    process.exit(1);
  }
  console.log("format-check passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
