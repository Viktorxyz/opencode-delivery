/**
 * GitHub operation store.
 *
 * Every typed GitHub mutation is recorded under
 * `<git-common-dir>/opencode-ship/github/operations/<operationId>.json`.
 * The record is an immutable log entry used for:
 *
 *   - idempotency: a second invocation with the same
 *     operationId is a no-op,
 *   - audit: the operator can inspect every GitHub mutation
 *     the controller has made on the consumer's behalf,
 *   - resume: a session that restarts after a crash can see
 *     which GitHub operations already completed.
 *
 * The store lives in the git-common-dir so main checkouts
 * and linked worktrees see the same log.
 */

import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

import { resolveGitCommonDir, opencodeShipStateDir } from "../state/git-common-dir.js";
import { atomicReplaceJson, publishImmutableJson } from "../state/durable-store.js";

async function operationsDir(repoRoot) {
  const common = await resolveGitCommonDir(repoRoot);
  return join(opencodeShipStateDir(common), "github", "operations");
}

const SAFE_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

function operationPath(dir, operationId) {
  if (!SAFE_ID_RE.test(operationId)) {
    throw new Error(`invalid operationId: ${JSON.stringify(operationId)}`);
  }
  return join(dir, `${operationId}.json`);
}

/**
 * Check whether an operation has already been recorded.
 *
 * @param {string} repoRoot
 * @param {string} operationId
 * @returns {Promise<boolean>}
 */
export async function hasOperation(repoRoot, operationId) {
  const dir = await operationsDir(repoRoot);
  return existsSync(operationPath(dir, operationId));
}

/**
 * Record an immutable operation result. Subsequent calls with
 * the same operationId are a no-op.
 *
 * @param {string} repoRoot
 * @param {string} operationId
 * @param {{ kind: string, ok: boolean, payload: unknown }} record
 * @returns {Promise<{ recorded: boolean, path: string }>}
 */
export async function recordOperation(repoRoot, operationId, record) {
  if (typeof operationId !== "string" || operationId.length === 0) {
    throw new Error("recordOperation: operationId must be a non-empty string");
  }
  if (!record || typeof record !== "object") {
    throw new Error("recordOperation: record must be an object");
  }
  const dir = await operationsDir(repoRoot);
  await mkdir(dir, { recursive: true });
  const path = operationPath(dir, operationId);
  if (existsSync(path)) {
    return { recorded: false, path };
  }
  const fullRecord = {
    operationId,
    kind: record.kind,
    ok: record.ok,
    payload: record.payload ?? null,
    recordedAt: new Date().toISOString(),
  };
  await publishImmutableJson(path, fullRecord);
  return { recorded: true, path };
}

/**
 * Read a recorded operation. Returns null if no record exists.
 *
 * @param {string} repoRoot
 * @param {string} operationId
 * @returns {Promise<unknown>}
 */
export async function readOperation(repoRoot, operationId) {
  if (typeof operationId !== "string" || operationId.length === 0) {
    return null;
  }
  if (!SAFE_ID_RE.test(operationId)) {
    return null;
  }
  const dir = await operationsDir(repoRoot);
  const path = operationPath(dir, operationId);
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * List every recorded operation id, sorted lexicographically.
 * Used by tests and by the resume path.
 *
 * @param {string} repoRoot
 * @returns {Promise<string[]>}
 */
export async function listOperationIds(repoRoot) {
  const dir = await operationsDir(repoRoot);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  return entries.filter((e) => e.endsWith(".json")).map((e) => e.replace(/\.json$/, "")).sort();
}

void atomicReplaceJson;
void dirname;
void unlink;
void writeFile;
