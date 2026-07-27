# Changelog

All notable changes to `opencode-delivery` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
