/*
 * Tiny tar helper used by `tests/package/packed-artifact.test.mjs`.
 *
 * We shell out to the BSD or GNU tar that ships with Node's PATH on
 * the test runner. Listing works on both.
 */

import { spawnSync } from "node:child_process";

export const tar = {
  async list(tarPath) {
    const r = spawnSync("tar", ["-tf", tarPath], { encoding: "utf8" });
    if (r.status !== 0) return [];
    return r.stdout.split("\n").filter(Boolean).map((path) => ({ path }));
  },
  async extract(tarPath, dest) {
    const r = spawnSync("tar", ["-xf", tarPath, "-C", dest], { encoding: "utf8" });
    if (r.status !== 0) {
      throw new Error(`tar extract failed: ${r.stderr}`);
    }
  },
};
