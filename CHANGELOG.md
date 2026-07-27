# Changelog

All notable changes to `opencode-delivery` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.3] — 2026-07-27

### Fixed
- `delivery_ready` and `delivery_merge` now pass the PR identity (`number: m.prNumber` and `branch: m.branch`) into `driver.readChecks` instead of the commit SHA. The GitHub CLI rejects SHAs on `gh pr checks`; previously the production callers bypassed the driver's SHA-fallback path entirely and the gate was unreachable.
- `delivery_review` now requires an explicit `headSha` argument on `Status: pass`. A missing `headSha` returns the typed `missing-head-sha` envelope; a mismatching `headSha` returns `head-mismatch`. The reviewer can no longer silently record a SHA it did not review.
- `delivery_cleanup` no longer uses `git branch -d` after a real squash merge (which fails with "not fully merged" because the feature commit is not an ancestor of base). It uses a CAS-style `git update-ref -d refs/heads/<branch> <expectedSha>` instead, gated on the recorded `lastPrHeadSha`. When the branch is already absent locally, the CAS call is treated as success.
- `delivery_cleanup` now accepts the bootstrap-failure recovery shape: a manifest stranded in `cleanup-pending` with `prNumber === null` is removed when the worktree is clean, no rebase is in progress, the recorded SHA matches the local HEAD, and no unpublished commits exist. The driver.readPullRequest call is skipped on this path. The recovery surface also returns `bootstrapRecovery: true` so the parent agent can render the envelope.
- `delivery_cleanup` no longer runs the `aheadOfAnywhere` drift probe when the local HEAD already matches the recorded `lastPrHeadSha`. After a real squash merge the feature commit is intentionally not an ancestor of any local/remote ref; the SHA guard is sufficient.
- The `delivery-reviewer` agent frontmatter now explicitly denies every other `delivery_*` tool (`delivery_inspect`, `delivery_issue`, `delivery_worktree`, `delivery_verify`, `delivery_pr`, `delivery_ready`, `delivery_merge`, `delivery_cleanup`) and allows only `delivery_review`. The reviewer is a single-shot, mutation-bounded subagent.
- `delivery-inspect` no longer passes a third argument to `doctor(repoRoot, packageVersion)` (the runtime signature accepts two arguments; the third was silently ignored).
- `src/state/lifecycle.d.ts` previously re-exported from a non-existent `./types.js`. Now it declares the runtime exports directly (STATES, createManifest, transition, canTransition, isTerminal, mustRerunReview, mustRerunVerifier, plus the Manifest / LifecycleState / TransitionResult types), so `tsc --checkJs` consumers see the same surface the runtime actually exposes.
- `src/drivers/git.js` `listWorktrees` annotates the local `cur` accumulator with JSDoc so strict `--checkJs` consumers no longer trip on the partial `{}` initialisation.

### Added
- New regression tests pinning every P0/P1 defect:
  - `tests/tools/ready-merge-readchecks.test.mjs` — `delivery_ready` and `delivery_merge` call `driver.readChecks` with `number: m.prNumber`.
  - `tests/tools/review-headsha-required.test.mjs` — `delivery_review` rejects missing or mismatching `headSha`, records on match, refuses non-pass verdicts.
  - `tests/tools/cleanup-recovery-no-pr.test.mjs` — `delivery_cleanup` removes worktree + branch + manifest when `state=cleanup-pending && prNumber === null`, and refuses when the worktree is dirty.
  - `tests/tools/cleanup-real-squash.test.mjs` — `delivery_cleanup` deletes the local feature branch via the CAS guard after a real feature commit + squash-equivalent base commit.
  - `tests/agents/reviewer-permission-boundary.test.mjs` — frontmatter explicitly allows `delivery_review` and denies every other `delivery_*` tool.
  - `tests/types/success-envelope-shape.test.mjs` — runtime success envelopes carry the fields consumers rely on (`issueNumber`, `manifestPath`).
- New `tsconfig.source.json` that runs `tsc --noEmit --allowJs --checkJs` over `src/**/*.{js,mjs}` plus the `.d.ts` companions. Wired into `scripts/typecheck.mjs` as the third step so `no-undef` style bugs surface before merge.
- `@types/node` added as a dev dependency so the source-level typecheck recognises `node:fs`, `node:path`, and `node:child_process`.

### Tests
- `npm run verify` covers 113 tests across 32 suites in ~12.6s. All green at HEAD.
- The new tests are pinned by their filename so a future regression that reintroduces the SHA fallback, the silent reviewer recording, the `git branch -d` failure, or the stranded bootstrap-failure manifest fails the suite immediately.

## [0.1.2] — 2026-07-27

### Added
- TypeScript consumer fixture (`tests/fixtures/consumer.ts`) that imports every public value export from `src/index.js` and uses the lifecycle, gates, doctor, and every tool factory with mock driver + adapter deps.
- Strict consumer tsconfig (`tests/fixtures/consumer-tsconfig.json`) with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`, `useUnknownInCatchVariables`. Compiled via `tsc --noEmit` in `scripts/typecheck.mjs`.
- New regression tests under `tests/tools/` and `tests/agents/`:
  - `tests/types-value-exports.test.mjs` (consumer-fixture compile, public-export parity, value-export coverage).
  - `tests/tools/issue-idempotent.test.mjs` (delivery_issue never resets an existing manifest, even after draft-open).
  - `tests/tools/worktree-path-escape.test.mjs` (`../../` escape and absolute paths refused with `path-escape` envelope; state never advances).
  - `tests/tools/bootstrap-failure-recovery.test.mjs` (failed bootstrap transitions the manifest to `cleanup-pending` with `fatalReason`; `scanRecovery` surfaces the manifest).
  - `tests/tools/pr-body-keeps-closing.test.mjs` (refresh keeps `Closes #N` even when the new body omits it).
  - `tests/drivers/read-checks-by-pr.test.mjs` (driver queries GitHub by PR number / branch when available; SHA fallback only when neither is given).
  - `tests/tools/cleanup-after-branch-delete.test.mjs` (cleanup succeeds when the remote feature branch is gone AND head matches expected SHA; refuses when local head has drifted).
  - `tests/tools/verify-manifest-path.test.mjs` (delivery_verify returns the actual manifest path under git-common-dir, not the adapter path).
  - `tests/agents/delivery-reviewer-contract.test.mjs` (the reviewer agent instructs itself to call `delivery_review` with the head SHA on pass).
- TypeScript dependency (`typescript@^5.6.0`) added to `devDependencies` so the consumer fixture compiles locally without a hoisted install.

### Changed
- `src/types.d.ts` now declares every public value export with the right signature (function-return types, optional fields, branded sha/branch types). Consumers get real type checking instead of `any` for the package surface.
- `src/index.js` re-exports the same surface; runtime behaviour unchanged.
- `package.json` bumps to `0.1.2`.
- `scripts/typecheck.mjs` now chains `node --check` (over `scripts/typecheck-node.mjs`) and `tsc --noEmit -p tests/fixtures/consumer-tsconfig.json` so JS syntax errors AND `.d.ts` drift are both detected.
- `scripts/verify.mjs` covers the new test files (24 suites across 22 test files).
- `delivery-reviewer` agent now instructs itself to invoke `delivery_review` with the PR head SHA on `Status: pass`. Refuses to record on any other verdict.

### Fixed
- `delivery_issue` now reads the existing manifest before creating one. A second call after `draft-open` returns the same `issueNumber` and preserves `lastReviewerSha` / `lastVerifierSha` / `prNumber` instead of overwriting them.
- `delivery_worktree` refuses any resolved path that escapes `adapter.worktree.root` (`../../` or absolute paths) with a typed `path-escape` envelope; the manifest does not advance.
- `delivery_worktree` bootstrap failure now writes `fatalReason` and transitions the manifest to `cleanup-pending` so the recovery scan can act on it.
- `delivery_pr` refresh path now merges the existing `Closes #N` line into the new body when missing, so the PR never silently drops its link to the originating issue.
- `gh-cli.readChecks` now prefers PR number / branch over the SHA fallback. The SHA is used only when no PR identity is provided.
- `delivery_cleanup` now tolerates the remote feature branch being deleted by GitHub after squash merge: a CAS-style expected-SHA guard accepts cleanup when the local branch head matches `lastPrHeadSha` even with the remote ref gone. Head drift still refuses.
- `delivery_verify` returns the actual manifest file path it just wrote (under `<git-common-dir>/opencode-delivery/manifests/<taskId>.json`), not the adapter path.
- `delivery_cleanup` falls back to checking any local/remote ref for unpublished commits when the configured remote ref is gone, so the unpublished-commit guard still works for forks.

### Tests
- `npm run verify` covers 99 tests across 24 suites. All green at HEAD.
- TypeScript consumer-fixture typecheck enforces declaration drift on every public value export.
- The reviewer-agent contract test guards against future agents drifting away from `delivery_review`.

## [0.1.1] — 2026-07-27

### Added
- New `delivery_review` tool that records reviewer SHAs on `pass` envelopes only and refuses on any other verdict.
- New `gates.js` helper that centralises Ready/Merge gate checking (reviewer SHA, verifier SHA, PR head SHA, required CI checks).
- TypeScript declaration surface (`src/types.d.ts`) describing the public API for consumer typechecks.
- Per-tool deterministic tests for every delivery_* wrapper (inspect, issue, worktree, verify, pr, ready, review, merge, cleanup), covering happy paths and stop-conditions (idempotency, stale head, missing/pending/failing CI, dirty worktree, base mismatch, forbidden transitions, missing manifest, wrong state).
- `createGhStub` factory that injects a deterministic `gh` runner for unit tests without spawning processes.
- README now states the v0.1.1 surface is complete and ready for consumer pin.

### Changed
- `createGhDriver()` accepts an optional `{ runner, cwd, env }` so tests can stub every `gh` invocation. Production still spawns `gh` directly when no runner is injected.
- `validateAdapter` no longer reads the lockfile at startup; `writeLock` is a maintenance-only operation called explicitly by CI or operators. Plugin startup is read-only.
- Lifecycle state machine allows idempotent self-transitions (`merged → merged`, `validating → validating`, etc.) so re-entering a tool does not fail.
- `delivery_worktree` runs the adapter's bootstrap argv list, computes the absolute worktree path, and uses the local `main` ref when no `origin` remote is configured.
- `delivery_verify` honours `timeoutMs`, returns a typed `verify-failed` envelope on non-zero exit, and emits `worktree-dirty` when `requireCleanDiffAfter` is set and the working tree is dirty.
- `delivery_ready` and `delivery_merge` re-run every gate (`checkGates`) instead of trusting the manifest state.
- `delivery_cleanup` requires the PR to be merged, the base to match the manifest, the worktree head to match the recorded SHA, and no unpublished commits. Uses `git branch -d` (not `-D`).
- `delivery_pr` transitions to `draft-open` via the lifecycle and uses an idempotent self-transition when refreshing the PR body.

### Fixed
- GitHub driver no longer references undefined `cwd`, `env`, `number`, `url`, `input`, and friends on every code path.
- Recovery `scanRecovery` no longer throws on an undefined `total` counter.
- Manifest store uses ESM `unlink` instead of a CommonJS `require` of `node:fs`.
- `git.js` `safeExists` uses the ESM `existsSync` import instead of a CommonJS `require`.
- Adapter loader uses ESM `existsSync` for `findOpencodeDir`.

### Tests
- `npm run verify` covers all eight tool wrappers plus the new gate helper. **87/87 green** at HEAD (16 test suites across 13 test files).

### Notes
- Consumers should continue to pin a commit hash until the public surface stabilises. The Leo consumer (#159) will repin after merge.

## [0.1.0] — 2026-07-27

### Added
- Project-adapter JSON schema and loader (`loadAdapter`, `validateAdapter`, `writeLock`, `readLock`, `findOpencodeDir`).
- Lifecycle state machine: `issue-linked → worktree-created → draft-open → validating → ready → merged → cleanup-pending → cleaned`, plus `failed` and `aborted` exit states.
- Atomic, `git-common-dir`-scoped manifest persistence with `git rev-parse --path-format=absolute` resolution.
- Git worktree driver (`spawnSync(git, argv)`-only, no force-push / no rebase-after-push surface).
- GitHub CLI driver backed by typed `gh pr/issue` verbs (no `gh api` shortcut).
- Doctor (`scanRecovery`, `wouldCleanupBeSafe`, `removeManifestIfSafe`).
- Typed OpenCode tool factories: `createInspectTool`, `createIssueTool`.
- Six-section envelope contracts for the `delivery-reviewer` and `delivery-verifier` subagents.
- Workflow skills `delivery-workflow` and `planning-research-checkpoint`.
- Schema templates for consumer projects (`project-adapter.example.json`, `project-opencode-shim.json`).
- GitHub Actions required-check template (informational only in this first release).
- 7 deterministic Node test files: adapter validation, lifecycle transitions, manifest-store, git driver, GitHub driver parsing, recovery helpers, doctor.

### Notes
- The remaining typed tool wrappers (`delivery_worktree`, `delivery_verify`, `delivery_pr`, `delivery_ready`, `delivery_merge`, `delivery_cleanup`) were scaffolded but not yet in the green test path in 0.1.0; promoted to the green path in 0.1.1.
- `npm run verify` runs `format:check`, `lint`, `typecheck`, and the test suite. All four steps are green at HEAD.

## [0.0.0] — Bootstrap

### Added
- Public GitHub repository bootstrap.
- MIT license.
- Top-level README describing the package, what it owns, and what it does not own.
- This changelog.
