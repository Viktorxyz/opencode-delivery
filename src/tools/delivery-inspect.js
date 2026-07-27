/**
 * delivery_inspect tool.
 *
 * Returns the current state of the lifecycle and the manifest, plus
 * the doctor report. This is the tool the parent agent calls first.
 * It is read-only and never writes the lockfile.
 */

import { doctor } from "../doctor.js";
import { readManifest } from "../state/manifest-store.js";

export function createInspectTool(deps) {
  return async function inspect(input) {
    const manifest = await readManifest(deps.repoRoot, input.taskId);
    const doc = await doctor(deps.repoRoot, deps.packageVersion, deps.adapter ?? null);
    return {
      contractVersion: 1,
      manifest: manifest ?? null,
      doctor: doc,
    };
  };
}
