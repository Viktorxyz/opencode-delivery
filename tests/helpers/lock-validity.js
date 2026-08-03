/*
 * Lock-write helper for tests.
 *
 * Writes a lock to a fresh temporary directory and returns the
 * directory path so individual tests can pin a known-bad lock under
 * that path and exercise the validators.
 */

import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

export async function writeValidatedLock(lock, overrides) {
  const dir = await mkdtemp(join(tmpdir(), "opencode-ship-lock-helper-"));
  const merged = {
    ...lock,
    ...(overrides ?? {}),
    manager: { ...(lock.manager ?? {}), ...((overrides ?? {}).manager ?? {}) },
  };
  await writeFile(join(dir, "ship.lock.json"), JSON.stringify(merged, null, 2) + "\n", "utf8");
  return dir;
}
