/*
 * Locate the opencode-ship package root from any caller.
 *
 * Three roots must resolve identically:
 *
 *   - source-tree test: `src/installer/...` runs under Node test, so
 *     `import.meta.url` points at the source file under
 *     `src/installer/<file>.js`; the package root is the parent of
 *     `src/`.
 *
 *   - source-tree CLI through esbuild bundle: esbuild emits
 *     `dist/cli.js`, and that bundle contains the modules that used
 *     to live under `src/installer/`. `import.meta.url` from any
 *     bundled module inside the CLI still resolves to `dist/cli.js`,
 *     so the package root is the parent of `dist/`.
 *
 *   - plugin bundle: same as the CLI bundle, except the bundled
 *     module is `dist/plugin.js`.
 *
 * Rather than rely on stack inspection we walk upward from
 * `import.meta.url`, reading `package.json` until we find one whose
 * `name` is `opencode-ship`. This is robust against call-site depth
 * and against the source/bundle duality above.
 */

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const PACKAGE_NAME = "opencode-ship";

export function resolvePackageRoot(startUrl) {
  let candidate = dirname(fileURLToPath(startUrl ?? import.meta.url));
  while (candidate && candidate !== "/") {
    const pkgPath = resolve(candidate, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const raw = readFileSync(pkgPath, "utf8");
        const pkg = JSON.parse(raw);
        if (pkg && pkg.name === PACKAGE_NAME) return candidate;
      } catch {
        // fall through and continue walking upward
      }
    }
    candidate = dirname(candidate);
  }
  throw new Error(`opencode-ship package root not found from ${startUrl ?? import.meta.url}`);
}
