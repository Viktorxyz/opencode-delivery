/*
 * Plan persistence.
 *
 * Plans live under `<plans.root>/<planSlug>/revision-NNNN.json`
 * (default root is `.git/opencode-ship/plans`, so the actual
 * filesystem path is inside the Git common directory and the
 * files are never tracked by Git). Each file is a single
 * revision of a plan. Revisions are append-only: writing
 * revision N+1 is allowed only after revision N is on disk;
 * overwriting or skipping is rejected. The store also refuses
 * to write a plan that does not pass `validatePlan`, so the
 * on-disk tree is always parseable and well-formed.
 *
 * The planSlug is the sanitized parent issue URL (org/repo#N
 * becomes `org-repo-N`). The store does not know about Git
 * internals beyond that; the Git common dir is just a path.
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { validatePlan, computePlanHash } from "./plan.js";

const PLAN_DIR_NAME = ".git/opencode-ship/plans";

function sanitizePlanSlug(parentIssue) {
  return String(parentIssue).replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase();
}

export function planDirFor(repoRoot, parentIssue) {
  return join(repoRoot, PLAN_DIR_NAME, sanitizePlanSlug(parentIssue));
}

export function planPathFor(repoRoot, parentIssue, revision) {
  const dir = planDirFor(repoRoot, parentIssue);
  return join(dir, `revision-${String(revision).padStart(4, "0")}.json`);
}

async function listRevisions(repoRoot, parentIssue) {
  const dir = planDirFor(repoRoot, parentIssue);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const revs = [];
  for (const e of entries) {
    const m = /^revision-(\d+)\.json$/.exec(e);
    if (m) revs.push(parseInt(m[1], 10));
  }
  revs.sort((a, b) => a - b);
  return revs;
}

/**
 * Read a specific revision. When no revision is given, return
 * the most recent. Returns null when no plan file matches.
 */
export async function readPlanRevision(repoRoot, parentIssue, revision) {
  if (!parentIssue) {
    throw new Error("readPlanRevision: parentIssue is required");
  }
  const revs = await listRevisions(repoRoot, parentIssue);
  if (revs.length === 0) return null;
  if (revision === undefined) {
    const latest = revs[revs.length - 1];
    const raw = await readFile(planPathFor(repoRoot, parentIssue, latest), "utf8");
    return JSON.parse(raw);
  }
  if (!revs.includes(revision)) return null;
  const raw = await readFile(planPathFor(repoRoot, parentIssue, revision), "utf8");
  return JSON.parse(raw);
}

/**
 * Write a plan to disk under the canonical path. Validates the
 * plan first, then enforces append-only against the most recent
 * existing revision. Returns the absolute file path on success.
 */
export async function writePlanRevision(repoRoot, plan) {
  if (typeof repoRoot !== "string") {
    throw new Error("writePlanRevision: first arg must be a repo root path");
  }
  if (!plan || typeof plan !== "object") {
    throw new Error("writePlanRevision: plan must be an object");
  }
  const validation = validatePlan(plan);
  if (!validation.ok) {
    throw new Error(
      `writePlanRevision: plan failed validation (${validation.kind}): ${validation.issues.join("; ")}`,
    );
  }
  const { parentIssue, revision } = plan;
  if (!parentIssue) {
    throw new Error("writePlanRevision: plan is missing parentIssue");
  }
  const dir = planDirFor(repoRoot, parentIssue);
  await mkdir(dir, { recursive: true });
  const existing = await listRevisions(repoRoot, parentIssue);
  if (existing.includes(revision)) {
    throw new Error(
      `writePlanRevision: revision ${revision} already exists for ${parentIssue} (append-only)`,
    );
  }
  const expectedNext = existing.length === 0 ? 1 : existing[existing.length - 1] + 1;
  if (revision !== expectedNext) {
    throw new Error(
      `writePlanRevision: expected revision ${expectedNext} but got ${revision} (append-only)`,
    );
  }
  const path = planPathFor(repoRoot, parentIssue, revision);
  const content = `${JSON.stringify({ ...plan, _hash: computePlanHash(plan) }, null, 2)}\n`;
  await writeFile(path, content, "utf8");
  return path;
}

/**
 * List every on-disk revision for a parent issue, in ascending
 * order. Returns an empty array when no plans exist.
 */
export async function listPlanRevisions(repoRoot, parentIssue) {
  return listRevisions(repoRoot, parentIssue);
}
