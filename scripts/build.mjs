#!/usr/bin/env node
/* Build the opencode-ship plugin and CLI bundles. */
import { build } from "esbuild";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

async function main() {
  const pkg = await readPackage();
  await mkdir(resolve(root, "dist"), { recursive: true });
  await bundlePlugin(pkg);
  await bundleCore(pkg);
  await bundleCli(pkg);
  // Touch .d.ts hints for the plugin root and core. Consumers that need
  // strict type-checking can use the source `.d.ts` files under `src/`.
  await writeFile(
    resolve(root, "dist/plugin.d.ts"),
    `export { ShipPlugin as default } from "../src/plugin.js";\n`,
    "utf8",
  );
  await writeFile(
    resolve(root, "dist/core.d.ts"),
    `export * from "../src/index.js";\n`,
    "utf8",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
