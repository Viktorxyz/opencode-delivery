/*
 * Re-export the existing public core surface so the
 * `opencode-ship/core` subpath resolves to exactly what the existing
 * `src/index.js` exposes.
 */

export * from "./index.js";
