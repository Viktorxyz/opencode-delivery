/*
 * Unit tests for the installer's JSON-pointer and hash utilities.
 *
 * These run without spawning the CLI; they are pure-function tests.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { setPointer, getPointer, removePointer, stableStringify, pointerPath } from "../../src/installer/json-pointer.js";
import { bytesHashString, canonicalHash } from "../../src/installer/hash.js";

test("setPointer then getPointer round-trips a deeply nested leaf", () => {
  const next = setPointer({ a: { b: { c: 1 } } }, "/a/b/c", 42);
  assert.equal(getPointer(next, "/a/b/c"), 42);
  assert.equal(getPointer(next, "/a/b").c, 42);
});

test("setPointer keeps untouched siblings untouched", () => {
  const next = setPointer({ a: { b: 1, c: 2 } }, "/a/b", 99);
  assert.deepEqual(next, { a: { b: 99, c: 2 } });
});

test("setPointer escapes ~ and /", () => {
  const next = setPointer({}, "/a~1b/with/slash", true);
  assert.equal(getPointer(next, "/a~1b/with/slash"), true);
});

test("removePointer removes an existing key and returns a new tree", () => {
  const next = removePointer({ a: { b: 1 }, c: 2 }, "/a/b");
  assert.deepEqual(next, { a: {}, c: 2 });
});

test("stableStringify sorts keys recursively", () => {
  const a = stableStringify({ b: 2, a: 1 });
  const b = stableStringify({ a: 1, b: 2 });
  assert.equal(a, b);
});

test("pointerPath joins segments with the JSON pointer format", () => {
  assert.equal(pointerPath(["agent", "build", "permission/delivery_merge"]), "/agent/build/permission~1delivery_merge");
});

test("bytesHashString is deterministic and 64 hex chars", () => {
  const h1 = bytesHashString("hello");
  const h2 = bytesHashString("hello");
  assert.equal(h1, h2);
  assert.match(h1, /^[0-9a-f]{64}$/);
});

test("canonicalHash ignores key ordering", () => {
  const a = canonicalHash({ b: 2, a: 1 });
  const b = canonicalHash({ a: 1, b: 2 });
  assert.equal(a, b);
});
