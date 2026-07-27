/**
 * Public type declarations for the opencode-delivery package.
 *
 * The package ships plain JavaScript ESM sources; this declaration
 * file gives TypeScript consumers the surface they need to typecheck
 * `import` statements without falling back to `any`.
 */

export type Sha = string;
export type Branch = string;
export type RepoSlug = `${string}/${string}`;
export type IssueNumber = number;
export type PullRequestNumber = number;

export type ContractVersion = 1;

export interface AdapterLock {
  contractVersion: ContractVersion;
  adapterSha256: Sha;
  writtenAt: string;
}

export type LifecycleState =
  | "issue-linked"
  | "worktree-created"
  | "draft-open"
  | "validating"
  | "ready"
  | "merged"
  | "cleanup-pending"
  | "cleaned"
  | "failed"
  | "aborted";

export interface LifecycleTransition {
  from: LifecycleState;
  to: LifecycleState;
  at: number;
  reason?: string;
}

export interface Manifest {
  schemaVersion: 1;
  taskId: string;
  repoIdentity: RepoSlug;
  issueNumber: IssueNumber | null;
  prNumber: PullRequestNumber | null;
  baseBranch: Branch;
  baseSha: Sha;
  branch: Branch;
  worktreePath: string | null;
  lastPrHeadSha: Sha | null;
  lastReviewerSha: Sha | null;
  lastVerifierSha: Sha | null;
  owner: string;
  state: LifecycleState;
  transitionLog: LifecycleTransition[];
  fatalReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateManifestInput {
  taskId: string;
  repoIdentity: RepoSlug;
  issueNumber: IssueNumber | null;
  baseBranch: Branch;
  baseSha: Sha;
  branch: Branch;
  owner: string;
  prNumber?: PullRequestNumber | null;
  lastPrHeadSha?: Sha | null;
}

export interface IssueSummary {
  number: IssueNumber;
  url: string;
  state: "OPEN" | "CLOSED";
  pullRequest: PullRequestSummary | null;
}

export interface PullRequestSummary {
  number: PullRequestNumber;
  url: string;
  baseRefName: Branch;
  headRefName: Branch;
  headSha: Sha;
  draft: boolean;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  mergeStateStatus: string;
  merged: boolean;
  mergedAt: string | null;
}

export interface CheckSummary {
  name: string;
  state: "success" | "failure" | "pending" | "neutral" | "skipped" | "cancelled" | "timed_out" | "action_required" | "stale" | "queued" | "in_progress" | "requested";
  bucket: "pass" | "fail" | "pending" | "skip" | "neutral";
}

export interface EnsureIssueResult {
  summary: IssueSummary;
  created: boolean;
}

export interface GithubDriver {
  ensureIssue(args: { repo: RepoSlug; title: string; body: string; labels: readonly string[] }): Promise<EnsureIssueResult>;
  openDraftPullRequest(args: { repo: RepoSlug; head: Branch; base: Branch; title: string; body: string; issueNumber: IssueNumber }): Promise<PullRequestSummary>;
  updatePullRequestBody(args: { repo: RepoSlug; number: PullRequestNumber; body: string }): Promise<void>;
  markReady(args: { repo: RepoSlug; number: PullRequestNumber }): Promise<void>;
  mergePullRequest(args: { repo: RepoSlug; number: PullRequestNumber; subject: string }): Promise<PullRequestSummary>;
  readPullRequest(args: { repo: RepoSlug; number: PullRequestNumber }): Promise<PullRequestSummary>;
  readChecks(args: { repo: RepoSlug; sha: Sha; required: readonly string[] }): Promise<CheckSummary[]>;
  comment(args: { repo: RepoSlug; number: PullRequestNumber; body: string }): Promise<void>;
  refreshHead(args: { repo: RepoSlug; number: PullRequestNumber }): Promise<Sha>;
}

export interface CreateGhDriverOptions {
  runner?: (args: readonly string[]) => Promise<{ status: number; stdout: string; stderr: string }>;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export type GhRunner = (args: readonly string[]) => Promise<{ status: number; stdout: string; stderr: string }>;

export interface RepoRef {
  owner: string;
  name: string;
}

export interface Adapter {
  contractVersion: 1;
  repository: {
    remote: string;
    defaultBranch?: { discover?: boolean; name?: Branch };
  };
  forge?: {
    driver: "github";
    issueRequired?: boolean;
    draftAfterFirstCommit?: boolean;
    issueClosingSyntax?: boolean;
  };
  worktree?: {
    root: string;
    branchTemplate: string;
    bootstrap?: readonly (readonly string[])[];
  };
  verification?: {
    commands: readonly { id: string; argv: readonly string[]; timeoutMs?: number }[];
    requireCleanDiffAfter?: boolean;
    invalidateOnHeadChange?: boolean;
  };
  review?: {
    agent: string;
    required: boolean;
    invalidateOnHeadChange: boolean;
  };
  ci?: {
    driver: "github-status-checks";
    requiredChecks: readonly string[];
    wait: boolean;
    flakyRetry: 0 | 1;
  };
  ready?: {
    requires: readonly ("review" | "local-verification" | "remote-ci")[];
    stopAfterReady: boolean;
  };
  merge?: {
    strategy: "squash";
    policy: "explicit-user-request-only";
    requireFreshGates: boolean;
  };
  cleanup?: {
    when: "next-task";
    requires: readonly ("pr-merged" | "worktree-clean" | "no-unpublished-commits")[];
  };
}

export interface AdapterLoadResult {
  ok: true;
  adapter: Adapter;
  path: string;
  sha256: Sha;
}

export interface AdapterLoadError {
  ok: false;
  error: { kind: "missing" | "parse" | "contract"; path: string; message?: string; issues?: readonly string[] };
}

export type TransitionResult =
  | { ok: true; from: LifecycleState; to: LifecycleState; at: number; reason?: string }
  | { ok: false; from: LifecycleState; attempted: LifecycleState; reason: string };

export interface GateSnapshot {
  prHead: Sha | null;
  reviewerSha: Sha | null;
  verifierSha: Sha | null;
  checks: readonly CheckSummary[];
  missingChecks: readonly string[];
  failingChecks: readonly string[];
  pendingChecks: readonly string[];
}

export interface GateCheck {
  ok: boolean;
  reason?: string;
  snapshot: GateSnapshot;
}

export interface DriverDeps {
  driver: GithubDriver;
  repoRoot: string;
  repoSlug: RepoSlug;
  owner: string;
  adapter: Adapter;
}

export type Envelope<TKind extends string, TData> = { kind: TKind } & TData;

export type IssueEnvelope = Envelope<
  "issue",
  {
    contractVersion: 1;
    created: boolean;
    issueNumber: IssueNumber;
    issueUrl: string;
    manifestPath: string;
  }
>;

export type MissingManifestEnvelope = Envelope<"missing-manifest", { taskId: string }>;
export type ManifestStateEnvelope = Envelope<"manifest-state", { state: LifecycleState }>;
export type MissingWorktreePathEnvelope = Envelope<"missing-worktree-path", Record<string, never>>;
export type MissingPrEnvelope = Envelope<"missing-pr", Record<string, never>>;
export type WorktreeExistsEnvelope = Envelope<"worktree-exists", Record<string, never>>;
export type BranchExistsLocallyEnvelope = Envelope<"branch-exists-locally", { branch: Branch }>;
export type BranchExistsRemotelyEnvelope = Envelope<"branch-exists-remotely", { branch: Branch }>;
export type RemoteFetchEnvelope = Envelope<"remote-fetch", { stderr: string }>;
export type CreateFailedEnvelope = Envelope<"create-failed", { stderr: string }>;
export type HeadChangedAfterVerifierEnvelope = Envelope<"head-changed-after-verifier", { headSha: Sha; verifierSha: Sha }>;
export type HeadChangedAfterReviewEnvelope = Envelope<"head-changed-after-review", { headSha: Sha; reviewSha: Sha }>;
export type MissingGateEnvelope = Envelope<"missing-gate", { gate: "review" | "local-verification" | "remote-ci" }>;
export type CiFailingEnvelope = Envelope<"ci-failing", { failing: readonly string[] }>;
export type CiPendingEnvelope = Envelope<"ci-pending", { pending: readonly string[] }>;
export type NotReadyEnvelope = Envelope<"not-ready", { state: LifecycleState }>;
export type WrongBaseEnvelope = Envelope<"wrong-base", { base: Branch }>;
export type HeadChangedEnvelope = Envelope<"head-changed", { headSha: Sha; manifestSha: Sha }>;
export type NotMergeableEnvelope = Envelope<"not-mergeable", { reason: string }>;
export type DirtyWorktreeEnvelope = Envelope<"dirty-worktree", Record<string, never>>;
export type RebaseInProgressEnvelope = Envelope<"rebase-in-progress", Record<string, never>>;
export type HeadMismatchEnvelope = Envelope<"head-mismatch", { headSha: Sha; manifestSha: Sha }>;
export type CurrentCheckoutEnvelope = Envelope<"current-checkout", { worktreePath: string }>;
export type UnmergedEnvelope = Envelope<"unmerged", { headSha: Sha; manifestSha: Sha }>;
export type BaseMismatchEnvelope = Envelope<"base-mismatch", { manifestBase: Branch; prBase: Branch }>;
export type HasUnpublishedCommitsEnvelope = Envelope<"has-unpublished-commits", { ahead: number }>;
export type RemoveFailedEnvelope = Envelope<"remove-failed", { stderr: string }>;
export type UnsafeCleanupEnvelope = Envelope<"unsafe-cleanup", { signals: readonly string[] }>;
export type VerifyFailedEnvelope = Envelope<"verify-failed", { commandId: string; status: number; headSha: Sha | null }>;
