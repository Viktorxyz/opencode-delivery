/*
 * JSON pointer utilities and minimal JSON document editing.
 *
 * We use RFC 6901 pointers with `~1` and `~0` escaping. The ship
 * installer owns only value leaves (build permissions and task
 * delegation). It does not own array membership by index; instead it
 * owns named object entries and exact scalar values.
 *
 * The document representation supports a plain JS object as either
 * raw JSON (the input we read) or a structured patch. We never
 * reformat pre-existing content, we only mutate the leaves we own.
 *
 * The module exports `getPointer`, `setPointer`, `removePointer`,
 * `applyOwnedEdits`, and `pointerPath`. All operations treat the
 * source as immutable; `setPointer` returns a new structure.
 */

function unescape(token) {
  return token.replace(/~1/g, "/").replace(/~0/g, "~");
}

function escape(token) {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

export function* parsePointer(pointer) {
  if (typeof pointer !== "string" || pointer === "") return;
  if (pointer[0] !== "/") {
    yield "";
    return;
  }
  const trimmed = pointer.slice(1);
  if (trimmed === "") return;
  for (const token of trimmed.split("/")) yield unescape(token);
}

export function getPointer(doc, pointer) {
  if (pointer === "" || pointer === "/") return undefined;
  let current = doc;
  for (const token of parsePointer(pointer)) {
    if (current === null || current === undefined) return undefined;
    if (typeof token === "string" && token.includes("=")) return undefined;
    current = current?.[token];
  }
  return current;
}

export function setPointer(doc, pointer, value) {
  const tokens = [...parsePointer(pointer)];
  if (tokens.length === 0) return value;
  if (!isObject(doc)) return value;
  const root = { ...doc };
  let cursor = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i];
    const next = cursor[key];
    const copy = isObject(next) ? { ...next } : Array.isArray(next) ? [...next] : {};
    cursor[key] = copy;
    cursor = copy;
  }
  cursor[tokens[tokens.length - 1]] = value;
  return root;
}

export function removePointer(doc, pointer) {
  const tokens = [...parsePointer(pointer)];
  if (tokens.length === 0) return doc;
  if (!isObject(doc)) return doc;
  const root = { ...doc };
  let cursor = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const key = tokens[i];
    const copy = isObject(cursor[key]) ? { ...cursor[key] } : { ...cursor[key] };
    cursor[key] = copy;
    cursor = copy;
  }
  delete cursor[tokens[tokens.length - 1]];
  return root;
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (isObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Canonical JSON for hashing: UTF-8 encoded, sorted keys,
 * no whitespace. Identical to `stableStringify` but tagged as
 * a separate function for clarity in plan-mirror call sites.
 */
export function canonicalJson(value) {
  return stableStringify(value);
}

export function pointerPath(segments) {
  return "/" + segments.map((s) => escape(String(s))).join("/");
}
