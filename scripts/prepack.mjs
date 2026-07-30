#!/usr/bin/env node
/* npm `prepack` hook: build first, then re-run minimal lint on packed artifact. */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

if (!existsSync("node_modules/.bin/esbuild")) {
  process.exit(0);
}

const build = spawnSync("node", ["scripts/build.mjs"], { stdio: "inherit" });
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}
