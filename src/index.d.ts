/**
 * Type companion for the runtime `src/index.js`. This file lives next
 * to the runtime entry point so any TypeScript consumer (or our own
 * `tests/fixtures/consumer.ts`) can resolve the package surface via
 * `moduleResolution: "Bundler"` without a separate `tsconfig`.
 *
 * The declarations here mirror `src/types.d.ts`; the runtime module
 * is unchanged.
 */

export * from "./types.js";
