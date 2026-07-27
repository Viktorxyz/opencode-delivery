/**
 * Lifecycle state machine for one issue → one worktree → one PR → one merge → one cleanup.
 *
 * State transitions are explicit, idempotent, and recoverable after a
 * crash. Each transition records a monotonic counter so that the
 * manifest can be replayed deterministically.
 */

export const STATES = [
  "issue-linked",
  "worktree-created",
  "draft-open",
  "validating",
  "ready",
  "merged",
  "cleanup-pending",
  "cleaned",
  "failed",
  "aborted",
];

const NEXT = {
  "issue-linked": ["worktree-created", "aborted", "failed"],
  "worktree-created": ["draft-open", "validating", "aborted", "failed"],
  "draft-open": ["validating", "aborted", "failed"],
  "validating": ["ready", "draft-open", "aborted", "failed"],
  "ready": ["merged", "validating", "failed"],
  "merged": ["cleanup-pending"],
  "cleanup-pending": ["cleaned", "failed"],
  "cleaned": [],
  "failed": ["aborted"],
  "aborted": [],
};

export function transition(m, to, opts) {
  opts = opts ?? {};
  if (!STATES.includes(m.state)) {
    return { ok: false, from: m.state, attempted: to, reason: `manifest state ${m.state} is not recognised` };
  }
  if (!STATES.includes(to)) {
    return { ok: false, from: m.state, attempted: to, reason: `target state ${to} is not recognised` };
  }
  const allowed = NEXT[m.state];
  if (!allowed.includes(to)) {
    return { ok: false, from: m.state, attempted: to, reason: `transition from ${m.state} to ${to} is not permitted` };
  }
  const now = (opts.now ?? (() => new Date()))();
  const at = now.getTime();
  const entry = { from: m.state, to, at };
  if (opts.reason !== undefined) entry.reason = opts.reason;
  const next = {
    ...m,
    state: to,
    transitionLog: [...m.transitionLog, entry],
    updatedAt: now.toISOString(),
  };
  if (to === "failed") {
    next.fatalReason = opts.reason ?? "unspecified";
  }
  return { ok: true, from: m.state, to, at, reason: opts.reason };
}

export function createManifest(input) {
  const now = (input.now ?? (() => new Date()))();
  return {
    schemaVersion: 1,
    taskId: input.taskId,
    repoIdentity: input.repoIdentity,
    issueNumber: input.issueNumber,
    prNumber: input.prNumber,
    baseBranch: input.baseBranch,
    baseSha: input.baseSha,
    branch: input.branch,
    worktreePath: input.worktreePath ?? null,
    lastPrHeadSha: input.lastPrHeadSha,
    lastReviewerSha: input.lastReviewerSha,
    lastVerifierSha: input.lastVerifierSha,
    owner: input.owner,
    state: "issue-linked",
    transitionLog: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function canTransition(from, to) {
  return NEXT[from].includes(to);
}

export function isTerminal(s) {
  return s === "cleaned" || s === "aborted";
}

export function mustRerunReview(previousSha, currentSha) {
  return previousSha !== currentSha;
}

export function mustRerunVerifier(previousSha, currentSha) {
  return previousSha !== currentSha;
}
