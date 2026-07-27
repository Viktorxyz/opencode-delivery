# Changelog

All notable changes to `opencode-delivery` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- The remaining typed tool wrappers (`delivery_worktree`, `delivery_verify`, `delivery_pr`, `delivery_ready`, `delivery_merge`, `delivery_cleanup`) are scaffolded but not yet in the green test path; they will be promoted in the next release.
- `pnpm run verify` runs `format:check`, `lint`, `typecheck`, and the test suite. All four steps are green at HEAD.
- Consumers should pin a commit hash and import from the relevant tool factory until the public surface stabilises.

## [0.0.0] — Bootstrap

### Added
- Public GitHub repository bootstrap.
- MIT license.
- Top-level README describing the package, what it owns, and what it does not own.
- This changelog.