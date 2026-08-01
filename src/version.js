/*
 * opencode-ship single-source version.
 *
 * The package version is declared in `package.json`. The esbuild
 * pipeline inlines it via `process.env.OPENCODE_SHIP_VERSION`; the
 * test runner and the bundled CLI therefore see the exact same
 * string. The template set identifier follows the version so an
 * installer reporting its own template set identifier proves it is
 * self-describing without any extra plumbing.
 *
 * No source file other than `package.json` may hard-code the
 * version; every consumer must import these symbols so a version
 * bump is the only place that actually bumps it.
 */

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FALLBACK_VERSION = "0.4.0";

function readPackageVersion() {
  const here = dirname(fileURLToPath(import.meta.url));
  let dir = here;
  for (let i = 0; i < 6; i += 1) {
    const candidate = resolve(dir, "package.json");
    if (existsSync(candidate)) {
      try {
        const raw = JSON.parse(readFileSync(candidate, "utf8"));
        if (raw && typeof raw.version === "string") return raw.version;
      } catch {
        // fall through and try the next ancestor
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return FALLBACK_VERSION;
}

export const PACKAGE_VERSION =
  process.env.OPENCODE_SHIP_VERSION ?? readPackageVersion();

export const TEMPLATE_SET = `v${PACKAGE_VERSION}`;
