// Build the opencode-ship plugin and CLI bundles.
import { build } from "esbuild";
import { mkdir, writeFile, readFile, copyFile, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = dirname(fileURLToPath(import.meta.url)) + "/..";

async function readPackage() {
  const raw = await readFile(resolve(root, "package.json"), "utf8");
  return JSON.parse(raw);
}

async function bundlePlugin(pkg) {
  await build({
    entryPoints: [resolve(root, "src/plugin.js")],
    outfile: resolve(root, "dist/plugin.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    splitting: false,
    sourcemap: false,
    logLevel: "info",
    banner: { js: `// opencode-ship v${pkg.version}` },
    define: { "process.env.OPENCODE_SHIP_VERSION": JSON.stringify(pkg.version) },
    external: ["node:*", "bun:*"],
  });
}

async function bundleCore(pkg) {
  await build({
    entryPoints: [resolve(root, "src/core-index.js")],
    outfile: resolve(root, "dist/core.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    splitting: false,
    sourcemap: false,
    logLevel: "info",
    banner: { js: `// opencode-ship/core v${pkg.version}` },
  });
}

async function bundleCli(pkg) {
  await build({
    entryPoints: [resolve(root, "src/cli.js")],
    outfile: resolve(root, "dist/cli.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    splitting: false,
    sourcemap: false,
    logLevel: "info",
    banner: {
      js: `#!/usr/bin/env node\n// opencode-ship CLI v${pkg.version}`,
    },
    define: { "process.env.OPENCODE_SHIP_VERSION": JSON.stringify(pkg.version) },
    external: ["node:*", "bun:*"],
  });
}

/**
 * Emit self-contained `.d.ts` files for the public API surfaces.
 *
 * We use a temporary `tsconfig.dts.json` that points at the entry
 * declaration files in `src/` and emits only `.d.ts` output into
 * `dist/` directly. The emitted files are self-contained: each
 * entry-point `.d.ts` only references types reachable through its
 * own declaration files, not `src/types.d.ts` or `src/`.
 */
async function emitDeclarations() {
  const tsconfig = {
    compilerOptions: {
      target: "ES2022",
      module: "ES2022",
      moduleResolution: "Bundler",
      allowJs: false,
      declaration: true,
      emitDeclarationOnly: true,
      outDir: resolve(root, "dist"),
      rootDir: resolve(root, "src"),
      skipLibCheck: true,
      strict: false,
      lib: ["ES2022"],
    },
    include: [
      resolve(root, "src/plugin.ts"),
      resolve(root, "src/cli.ts"),
      resolve(root, "src/core.ts"),
    ],
  };
  const tsconfigPath = resolve(root, "tsconfig.dts.json");
  await writeFile(tsconfigPath, JSON.stringify(tsconfig, null, 2), "utf8");

  const tscBin = resolve(root, "node_modules/.bin/tsc");
  const r = spawnSync(tscBin, ["-p", tsconfigPath, "--pretty", "false"], {
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (r.status !== 0) {
    throw new Error(`tsc --emitDeclarationOnly failed with exit ${r.status}`);
  }
}

async function main() {
  const pkg = await readPackage();
  await mkdir(resolve(root, "dist"), { recursive: true });
  await bundlePlugin(pkg);
  await bundleCore(pkg);
  await bundleCli(pkg);
  await emitDeclarations();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
