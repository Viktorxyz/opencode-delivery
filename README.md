# opencode-delivery

> Reusable, tech-stack-neutral OpenCode delivery package: issue/worktree/branch lifecycle, typed tools, reviewer/verifier agents, project-adapter contract.
>
> **Status:** v0.1.1. Lifecycle, project-adapter, GitHub CLI driver, Git worktree driver, doctor, recovery, gate helper, reviewer-recording tool, and every `delivery_*` typed tool factory are green and covered by deterministic unit tests. 87/87 tests pass under `npm run verify`.

---

## What this package is

`opencode-delivery` is a vendor-agnostic OpenCode delivery layer. It owns the small set of operations that turn a one-line user request into a green, conflict-free, ready-to-merge pull request, without leaking into the project’s tech stack, package manager, or test runner.

The package ships:

- a **lifecycle state machine** for one issue → one worktree → one PR → one merge → one cleanup;
- a **Git worktree driver** (no rebase-after-push, no force-push, no `--force-with-lease`);
- a **GitHub CLI driver** that talks only to typed `gh pr/issue` verbs (never `gh api`);
- a **typed OpenCode tool surface** (inspect, issue, worktree, verify, pr, ready, merge, cleanup);
- a **project-adapter schema** (`delivery.json` + `delivery.lock.json`) so any project can declare its own verify/bootstrap/CI commands;
- **reviewer** and **verifier** subagents that match the canonical six-section envelope;
- a **delivery-workflow** skill that drives the canonical lifecycle;
- a **planning-research-checkpoint** skill that offers a single, optional Deep Research gate per non-trivial plan;
- a **delivery doctor** that validates the adapter, package pin, and OpenCode compatibility;
- **recovery** for interrupted cleanup, half-written state files, and stale worktrees.

The package **does not** own:

- package managers, test commands, linters, docs layout, or CI templates;
- issue-label catalogues, release scripts, or deploy hooks;
- framework- or language-specific expertise (Better Auth, React, NLU, etc. live in consumer projects).

## Distribution

- Public GitHub repo, MIT licensed.
- Consumer projects pin a commit hash via `opencode.json` and a project plugin shim; the package is loaded by OpenCode through Bun’s npm plugin loader.
- No runtime auto-update. Updates arrive as normal PRs against this repo.

## Repository settings (intended)

- Squash merge only.
- Merge commits disabled.
- Rebase merge disabled.
- Automatic remote head-branch deletion after merge.
- Auto-merge disabled.
- GitHub Actions required checks are added later; the first release ships the workflow as informational so consumers can adopt on GitHub Free private plans first.

## Lifecycle (default)

1. Begin a Build task: clean up provably-merged worktrees.
2. Optional Deep Research checkpoint for non-trivial plans.
3. Find or create exactly one issue per PR.
4. Discover the default branch and fetch it.
5. Create a dedicated worktree and branch.
6. Run the project adapter’s bootstrap command.
7. Implement and commit.
8. Push and open a draft PR linked to the issue (`Closes #N`).
9. Continue commits/pushes on the same branch.
10. Merge latest default branch into the feature branch before final review.
11. Resolve mechanical conflicts autonomously; ask the user about semantic ones.
12. Run independent reviewer on the final HEAD.
13. Run canonical local verification.
14. Push and wait for required remote CI checks.
15. Mark the PR Ready and stop.
16. Explicit “merge it” re-runs the freshness checks and performs the squash merge.
17. Local cleanup runs at the next Build task.

## Status

The reusable core is operational at v0.1.1. The full lifecycle is covered by deterministic unit tests: `npm run verify` runs `format:check`, `lint`, `typecheck`, and the test suite against 16 suites across 13 test files. All four steps are green at HEAD; **87/87 tests pass** in a single deterministic run.

### What is implemented in v0.1.1

- `src/adapter.js` — project-adapter JSON schema and loader (`loadAdapter`, `validateAdapter`, `writeLock`, `readLock`, `findOpencodeDir`).
- `src/state/lifecycle.js` — `issue-linked → worktree-created → draft-open → validating → ready → merged → cleanup-pending → cleaned` state machine with idempotent self-transitions and `failed` / `aborted` exits.
- `src/state/manifest-store.js` — atomic, `git-common-dir`-scoped manifest persistence with `git rev-parse --path-format=absolute` resolution.
- `src/drivers/git.js` — `spawnSync(git, argv)`-only worktree primitives, plus `remoteExists` / `createWorktreeFromLocal` fallbacks.
- `src/drivers/github.js` — `parseRepoSlug` and the typed `GithubDriver` interface contract.
- `src/drivers/gh-cli.js` — production driver backed by typed `gh pr/issue` verbs (no `gh api`). Accepts an optional `{ runner, cwd, env }` for deterministic tests. `createGhStub` factory ships a queue-based stub for tests.
- `src/recovery.js` — `scanRecovery`, `wouldCleanupBeSafe`, `removeManifestIfSafe`.
- `src/doctor.js` — adapter/OpenCode compatibility report.
- `src/gates.js` — centralised Ready/Merge gate checking (reviewer SHA, verifier SHA, PR head SHA, required CI checks).
- `src/tools/delivery-*.js` — all nine typed tool factories: `inspect`, `issue`, `worktree`, `verify`, `pr`, `ready`, `review`, `merge`, `cleanup`.
- `agents/delivery-reviewer.md`, `agents/delivery-verifier.md` — six-section envelope contracts.
- `skills/delivery-workflow/SKILL.md`, `skills/planning-research-checkpoint/SKILL.md` — orchestration and research-checkpoint skills.
- `schema/project-adapter.example.json`, `schema/project-opencode-shim.json` — consumer templates.
- `.github/workflows/verify.yml` — required-check template (`delivery-verify` job).

### Tests

`npm run verify` (alias of `node scripts/verify.mjs`) runs `format:check`, `lint`, `typecheck`, and the deterministic `tsx --test` suite. 13 test files cover:

- Lifecycle state machine (every transition, every forbidden transition, monotonic timestamps, `fatalReason`).
- Manifest persistence (round-trip, missing, empty list, multi-manifest, atomic write, delete).
- Git driver (worktree listing, clean / rebase detection, worktree creation).
- GitHub driver (slug parsing, issue search vs create, `Closes #N` injection, checks mapping, stub queue).
- Adapter validation (every field, both happy and unhappy paths).
- Recovery helpers (full safe shape, every unsafe signal).
- Doctor (adapter contract version, lock match, package version).
- Gates (`checkGates` returns the typed envelope for every failure reason, opt-out respected).
- Every `delivery_*` tool with happy paths, missing inputs, missing manifests, wrong states, idempotency, stale heads, missing/pending/failing CI, dirty worktrees, base mismatches, missing merges, missing unpublished-commit guards.

## Status and licensing

- **License:** MIT. See `LICENSE`.
- **Versioning:** SemVer. v0.1.1 ships as the first fully-tested release. Subsequent releases follow the standard `<major>.<minor>.<patch>` rules described in the consumer adapter.