/*
 * Task reviewer (Spec + Quality verdicts) + immutable review package.
 *
 * The M3 task reviewer is a single sub-agent that returns two
 * verdicts from one report:
 *
 *   specKind:    "spec"     — does the implementation match the
 *                             plan's interfaces, testSeams, and
 *                             commands? Findings are blocking
 *                             (must be fixed) or nit (optional).
 *
 *   qualityKind: "quality"  — does the implementation pass the
 *                             plan's lint, typecheck, and verifier
 *                             surface? Findings are duplication,
 *                             style, or performance nits.
 *
 * The two verdicts are deliberately separate so a regression
 * (say, the code typechecks but the spec drifts) is visible in
 * exactly one verdict, not muddled into a single "pass / fail"
 * boolean. Build reads both verdicts and decides whether to own
 * the commit.
 */

import { ensureRunDir } from "./run-store.js";
import { computePlanHash } from "./plan.js";
import { join } from "node:path";
import { writeFile } from "node:fs/promises";

const REVIEW_PACKAGE_FILE = "review-package.json";

function makeVerdict({ kind, taskId, planHash, revision, fixRound, kindKey, findings }) {
  return {
    kind,
    kindKey,
    taskId,
    planHash,
    revision,
    fixRound,
    findings,
    emittedAt: new Date().toISOString(),
  };
}

// Expose the spec / quality discriminator as a top-level key
// (\`specKind\` / \`qualityKind\`) on each verdict so consumers
// do not have to introspect \`kind\` + \`kindKey\`. Both keys are
// set for backward compatibility.
function withDiscriminator(verdict, discriminator) {
  return { ...verdict, [discriminator]: verdict.kind };
}

/**
 * Spec verdict: did the implementation match the plan?
 */
export function emitSpecVerdict({ taskId, planHash, revision, fixRound, findings = [] }) {
  return withDiscriminator(
    makeVerdict({
      kind: "spec",
      kindKey: "spec",
      taskId,
      planHash,
      revision,
      fixRound,
      findings,
    }),
    "specKind",
  );
}

/**
 * Quality verdict: did the implementation pass lint / typecheck /
 * verifier? Findings are non-blocking nits; the build still owns
 * the commit when quality is nit-only.
 */
export function emitQualityVerdict({ taskId, planHash, revision, fixRound, findings = [] }) {
  return withDiscriminator(
    makeVerdict({
      kind: "quality",
      kindKey: "quality",
      taskId,
      planHash,
      revision,
      fixRound,
      findings,
    }),
    "qualityKind",
  );
}

/**
 * Build owns the commit only when both verdicts are non-blocking
 * AND the immutable review package is on disk (sealed by
 * `assembleReviewPackage`). This is the contract the three-round
 * breaker relies on.
 */
export function shouldCommit(spec, quality) {
  const specBlocking = (spec?.findings ?? []).some((f) => f.kind === "blocking");
  const qualityBlocking = (quality?.findings ?? []).some((f) => f.kind === "blocking");
  return !specBlocking && !qualityBlocking;
}

/**
 * Assemble the immutable review package on disk. The package
 * includes the active plan, both verdicts, the plan hash, and
 * a sealed timestamp. The path is
 * `.git/opencode-ship/runs/<taskId>/reports/review-package.json`.
 */
export async function assembleReviewPackage(repoRoot, taskId, plan, verdicts) {
  if (!verdicts?.specVerdict || !verdicts?.qualityVerdict) {
    throw new Error("assembleReviewPackage: both spec and quality verdicts are required");
  }
  await ensureRunDir(repoRoot, taskId);
  const pkg = {
    taskId,
    revision: plan.revision,
    planHash: computePlanHash(plan),
    sealedAt: new Date().toISOString(),
    specVerdict: verdicts.specVerdict,
    qualityVerdict: verdicts.qualityVerdict,
    plan,
  };
  const path = join(repoRoot, ".git", "opencode-ship", "runs", taskId, "reports", REVIEW_PACKAGE_FILE);
  await writeFile(path, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return pkg;
}

/**
 * Read a previously-sealed review package from disk. Returns null
 * if the package does not exist (e.g. the task has not been
 * reviewed yet).
 */
export async function readReviewPackage(repoRoot, taskId) {
  const path = join(repoRoot, ".git", "opencode-ship", "runs", taskId, "reports", REVIEW_PACKAGE_FILE);
  try {
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e?.code === "ENOENT") return null;
    throw e;
  }
}
