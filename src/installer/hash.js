/*
 * File hashing utilities.
 *
 * The installer uses two distinct hashes:
 *   - bytesHash: SHA-256 over the raw bytes on disk (or desired bytes).
 *   - canonicalHash: SHA-256 of the canonical JSON value (used for
 *     the lock's self-integrity).
 */

import { createHash } from "node:crypto";
import { stableStringify } from "./json-pointer.js";

export function bytesHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

export function bytesHashString(text) {
  return bytesHash(Buffer.from(text, "utf8"));
}

export function canonicalHash(value) {
  return bytesHashString(stableStringify(value));
}
