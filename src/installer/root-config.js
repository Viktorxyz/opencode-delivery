/*
 * Apply installer-owned entries into the root opencode.json / .jsonc.
 *
 * The installer owns ONLY the Build-agent permission entries for the
 * nine `delivery_*` tools and the two `task.delivery-*` delegation
 * allow-rules. Nothing else is touched. The root config remains a
 * shared document; we never overwrite pre-existing equal values,
 * never replace the whole file, and never invent a new file unless
 * the user has no root config and `init` is run explicitly.
 *
 * The apply operation is a pure function on a parsed object plus a
 * pointer list. The caller persists the result with `jsonc` or
 * `json` formatting as appropriate.
 *
 * Conflicts (leaf differs from installed value AND differs from
 * default) are surfaced by the planner; this module never silently
 * overwrites them.
 */

import { setPointer, getPointer, stableStringify } from "./json-pointer.js";
import { POINTER_ENTRIES } from "./catalog.js";
import { bytesHashString } from "./hash.js";

export function applyOwnedPointers(rootDoc, { pointerEntries = POINTER_ENTRIES, allowEqualValues = true } = {}) {
  const result = { doc: rootDoc, applied: [], skipped: [] };
  let doc = rootDoc;
  for (const entry of pointerEntries) {
    const existing = getPointer(doc, entry.pointer);
    if (existing === undefined) {
      doc = setPointer(doc, entry.pointer, entry.value);
      result.applied.push({ pointer: entry.pointer, value: entry.value });
      continue;
    }
    if (existing === entry.value) {
      if (allowEqualValues) {
        result.skipped.push({ pointer: entry.pointer, reason: "already equal" });
      }
      continue;
    }
    result.skipped.push({ pointer: entry.pointer, reason: "different existing value", existing, desired: entry.value });
  }
  return result;
}

export function pointerIntegrity(doc, pointer, value) {
  return bytesHashString(stableStringify(getPointer(doc, pointer)) + value);
}
