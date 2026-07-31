// Public type surface for the `opencode-ship` plugin entry.
// This file is the entry-point `.ts` whose emitted `.d.ts` lands at
// `dist/plugin.d.ts`. The runtime is bundled into `dist/plugin.js`
// by esbuild. Consumers importing `opencode-ship` get the bundled
// runtime plus this declaration.
import type { Plugin } from "@opencode-ai/plugin";

declare const ShipPlugin: Plugin;
export default ShipPlugin;
export { ShipPlugin };