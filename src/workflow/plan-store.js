/**
 * Plan store.
 *
 * Persists immutable PlanV2 records under
 * `<git-common-dir>/opencode-ship/plans/<workflowId>/revisions/<NNNN>/plan.json`.
 * The directory layout matches the durable layout documented
 * in the plan: each revision is a separate, append-only
 * directory; later revisions supersede earlier ones by hash.
 *
 * Approval records live in `revisions/<NNNN>/approval.json`
 * (or `rejection.json`); mirror records live in
 * `revisions/<NNNN>/mirror.json`.
 */

import { readFile, writeFile, mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";

import { resolveGitCommonDir, opencodeShipStateDir } from "../state/git-common-dir.js";
import { publishImmutableJson, atomicReplaceJson, updateSnapshotCas } from "../state/durable-store.js";
import { computePlanHash, validatePlanV2 } from "./plan.js";

function revisionsDir(commonDir, workflowId) {
  return join(opencodeShipStateDir(commonDir), "plans", workflowId, "revisions");
}

function revisionDir(commonDir, workflowId, revision) {
  const n = String(revision).padStart(6, "0");
  return join(revisionsDir(commonDir, workflowId), n);
}

async function resolveCommon(repoRoot) {
  return resolveGitCommonDir(repoRoot);
}

/**
 * @param {string} repoRoot
 * @param {string} workflowId
 * @returns {Promise<string>}
 */
export async function plansRoot(repoRoot, workflowId) {
  const common = await resolveCommon(repoRoot);
  return join(opencodeShipStateDir(common), "plans", workflowId);
}

/**
 * Persist a plan revision. The plan is hash-validated and
 * schema-validated before publication. Re-submitting the same
 * plan hash is a no-op; re-submitting a different plan with
 * the same revision is rejected.
 *
 * @param {string} repoRoot
 * @param {object} plan
 * @returns {Promise<{ recorded: boolean, path: string, hash: string }>}
 */
export async function publishPlanRevision(repoRoot, plan) {
  const v = validatePlanV2(plan);
  if (!v.ok) {
    throw new Error(`publishPlanRevision: invalid plan: ${v.issues.join("; ")}`);
  }
  const hash = computePlanHash(plan);
  const common = await resolveCommon(repoRoot);
  const dir = revisionDir(common, plan.workflowId, plan.revision);
  await mkdir(dir, { recursive: true });
  const planPath = join(dir, "plan.json");
  if (existsSync(planPath)) {
    const existing = JSON.parse(await readFile(planPath, "utf8"));
    if (existing?.plan?.workflowId !== plan.workflowId) {
      throw new Error(`publishPlanRevision: workflowId mismatch on existing record at ${planPath}`);
    }
    if (existing?.hash !== hash) {
      throw new Error(`publishPlanRevision: hash mismatch on existing record at ${planPath} (existing ${existing.hash}, new ${hash})`);
    }
    return { recorded: false, path: planPath, hash };
  }
  const record = {
    plan,
    hash,
    publishedAt: new Date().toISOString(),
  };
  await publishImmutableJson(planPath, record);
  return { recorded: true, path: planPath, hash };
}

/**
 * Publish an approval record. The approval binds a plan
 * revision to a decision and a session.
 *
 * @param {string} repoRoot
 * @param {{ workflowId: string, revision: number, decision: 'approved', sessionID: string, approvedBy: string, approvedAt: string, chunkIds: string[], chunkHashes: string[], baseSha: string, models: { planner: string, builder: string, finalReviewer: string } }} approval
 * @returns {Promise<{ recorded: boolean, path: string }>}
 */
export async function publishApproval(repoRoot, approval) {
  if (!approval || typeof approval !== "object") {
    throw new Error("publishApproval: approval must be an object");
  }
  if (approval.decision !== "approved") {
    throw new Error(`publishApproval: unsupported decision ${approval.decision}`);
  }
  if (typeof approval.sha256 !== "string" || approval.sha256.length !== 64) {
    throw new Error("publishApproval: sha256 required");
  }
  const common = await resolveCommon(repoRoot);
  const dir = revisionDir(common, approval.workflowId, approval.revision);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "approval.json");
  const planPath = join(dir, "plan.json");
  if (existsSync(planPath)) {
    const planRecord = JSON.parse(await readFile(planPath, "utf8"));
    if (planRecord.hash !== approval.sha256) {
      throw new Error(`publishApproval: sha256 mismatch with plan record (plan ${planRecord.hash?.slice(0, 8)}, approval ${approval.sha256.slice(0, 8)})`);
    }
  }
  if (existsSync(path)) {
    return { recorded: false, path };
  }
  await publishImmutableJson(path, { ...approval, publishedAt: new Date().toISOString() });
  return { recorded: true, path };
}

/**
 * Publish a mirror receipt that records the issue-side
 * comment ids and their hashes. The mirror is the durable
 * remote copy that lets a fresh session restore the plan.
 *
 * @param {string} repoRoot
 * @param {{ workflowId: string, revision: number, issueNumber: number, chunkIds: string[], chunkHashes: string[], sealedCommentId: string, sealedAt: string }} mirror
 * @returns {Promise<{ recorded: boolean, path: string }>}
 */
export async function publishMirrorReceipt(repoRoot, mirror) {
  if (!mirror || typeof mirror !== "object") {
    throw new Error("publishMirrorReceipt: mirror must be an object");
  }
  const common = await resolveCommon(repoRoot);
  const dir = revisionDir(common, mirror.workflowId, mirror.revision);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "mirror.json");
  if (existsSync(path)) {
    return { recorded: false, path };
  }
  await publishImmutableJson(path, { ...mirror, publishedAt: new Date().toISOString() });
  return { recorded: true, path };
}

/**
 * List every persisted revision for a workflow.
 *
 * @param {string} repoRoot
 * @param {string} workflowId
 * @returns {Promise<Array<{ revision: number, hash: string, planPath: string, approvalPath: string | null, mirrorPath: string | null }>>}
 */
export async function listRevisions(repoRoot, workflowId) {
  const common = await resolveCommon(repoRoot);
  const dir = revisionsDir(common, workflowId);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const out = [];
  for (const e of entries) {
    const m = e.match(/^(\d{6})$/);
    if (!m) continue;
    const revision = Number(m[1]);
    const sub = join(dir, e);
    const planPath = join(sub, "plan.json");
    const approvalPath = join(sub, "approval.json");
    const mirrorPath = join(sub, "mirror.json");
    let hash = null;
    if (existsSync(planPath)) {
      try {
        const raw = JSON.parse(await readFile(planPath, "utf8"));
        hash = raw.hash ?? null;
      } catch { /* corrupt record */ }
    }
    out.push({
      revision,
      hash,
      planPath,
      approvalPath: existsSync(approvalPath) ? approvalPath : null,
      mirrorPath: existsSync(mirrorPath) ? mirrorPath : null,
    });
  }
  out.sort((a, b) => a.revision - b.revision);
  return out;
}

/**
 * Read a plan revision. Returns null when no record exists.
 *
 * @param {string} repoRoot
 * @param {string} workflowId
 * @param {number} revision
 * @returns {Promise<{ plan: object, hash: string, publishedAt: string } | null>}
 */
export async function readPlanRevision(repoRoot, workflowId, revision) {
  const common = await resolveCommon(repoRoot);
  const path = join(revisionDir(common, workflowId, revision), "plan.json");
  if (!existsSync(path)) return null;
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Read the latest published plan revision.
 *
 * @param {string} repoRoot
 * @param {string} workflowId
 * @returns {Promise<{ revision: number, plan: object, hash: string, publishedAt: string } | null>}
 */
export async function readLatestPlan(repoRoot, workflowId) {
  const revs = await listRevisions(repoRoot, workflowId);
  if (revs.length === 0) return null;
  const latest = revs[revs.length - 1];
  const record = await readPlanRevision(repoRoot, workflowId, latest.revision);
  if (!record) return null;
  return { revision: latest.revision, plan: record.plan, hash: record.hash, publishedAt: record.publishedAt };
}

/**
 * Publish a rejection record. The rejection halts plan approval
 * and surfaces the planner's blocker to the controller.
 *
 * @param {string} repoRoot
 * @param {{ workflowId: string, revision: number, decision: 'rejected', rejectedBy: string, rejectedAt: string, reason: string }} rejection
 * @returns {Promise<{ recorded: boolean, path: string }>}
 */
export async function publishRejection(repoRoot, rejection) {
  if (!rejection || typeof rejection !== "object") {
    throw new Error("publishRejection: rejection must be an object");
  }
  if (rejection.decision !== "rejected") {
    throw new Error(`publishRejection: unsupported decision ${rejection.decision}`);
  }
  if (typeof rejection.reason !== "string" || rejection.reason.length === 0) {
    throw new Error("publishRejection: reason required");
  }
  const common = await resolveCommon(repoRoot);
  const dir = revisionDir(common, rejection.workflowId, rejection.revision);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "rejection.json");
  if (existsSync(path)) {
    return { recorded: false, path };
  }
  await publishImmutableJson(path, { ...rejection, publishedAt: new Date().toISOString() });
  return { recorded: true, path };
}

/**
 * Hydrate a plan revision from a supplied canonical-JSON payload
 * set. The combined chunk string is verified: its hash must
 * match the expected hash; the plan must validate under PlanV2.
 * The function is the single restore path used by `ship_resume`
 * when the local plan is missing.
 *
 * @param {string} repoRoot
 * @param {string} workflowId
 * @param {number} revision
 * @param {{ chunks: string[], expectedHash: string }} input
 * @returns {Promise<{ recorded: boolean, path: string, hash: string }>}
 */
export async function hydratePlanRevisionFromMirror(repoRoot, workflowId, revision, input) {
  if (!input || !Array.isArray(input.chunks) || input.chunks.length === 0) {
    throw new Error("hydratePlanRevisionFromMirror: chunks required");
  }
  if (typeof input.expectedHash !== "string" || input.expectedHash.length !== 64) {
    throw new Error("hydratePlanRevisionFromMirror: expectedHash required");
  }
  const combined = input.chunks.join("");
  const combinedHash = createHash("sha256").update(combined, "utf8").digest("hex");
  if (combinedHash !== input.expectedHash) {
    throw new Error(`hydratePlanRevisionFromMirror: chunk-hash mismatch (combined ${combinedHash.slice(0, 8)}, expected ${input.expectedHash.slice(0, 8)})`);
  }
  let plan;
  try {
    plan = JSON.parse(combined);
  } catch (err) {
    throw new Error(`hydratePlanRevisionFromMirror: malformed JSON: ${err?.message ?? err}`);
  }
  const v = validatePlanV2(plan);
  if (!v.ok) {
    throw new Error(`hydratePlanRevisionFromMirror: invalid plan: ${v.issues.join("; ")}`);
  }
  const hash = computePlanHash(plan);
  if (hash !== input.expectedHash) {
    throw new Error(`hydratePlanRevisionFromMirror: hash mismatch after restore (recomputed ${hash.slice(0, 8)}, expected ${input.expectedHash.slice(0, 8)})`);
  }
  const common = await resolveCommon(repoRoot);
  const dir = revisionDir(common, workflowId, revision);
  await mkdir(dir, { recursive: true });
  const path = join(dir, "plan.json");
  if (existsSync(path)) {
    const existing = JSON.parse(await readFile(path, "utf8"));
    if (existing.hash !== hash) {
      throw new Error(`hydratePlanRevisionFromMirror: existing record hash differs from restored hash`);
    }
    return { recorded: false, path, hash };
  }
  await publishImmutableJson(path, { plan, hash, publishedAt: new Date().toISOString() });
  return { recorded: true, path, hash };
}

import { createHash } from "node:crypto";

void writeFile;
void unlink;
void dirname;
void atomicReplaceJson;
void updateSnapshotCas;
