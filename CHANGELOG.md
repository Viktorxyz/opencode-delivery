# Changelog

All notable changes to `opencode-ship` are recorded here.

## 0.9.0 — Complete engineering profile publish

`opencode-ship@0.9.0` ships the transition matrix smoke required by issue #24 (Task 10 in approved plan). The smoke covers the core↔engineering transition shape — core omits engineering-only files, engineering installs them, and the lock's `manager.profile` field tracks the active profile across upgrades. The full E2E install (`pnpm dlx opencode-ship@latest`) continues to be exercised by the existing installer-cli tests; the new module focuses on the local-dev file set so the smoke runs in the default `npm run verify` pipeline.

### Verification

- `npm run verify` exits `0` with 320 tests across 34 suites on the v0.9 HEAD.

### Added

- **Transition matrix smoke.** `tests/package/transition-matrix.test.mjs` covers the core omits engineering, engineering adds engineering, and the lock `manager.profile` tracks the active profile across upgrades. The module is gated by `OPENCODE_SHIP_SMOKE_FULL=1` for the full E2E run; the lite version always runs and asserts the local-dev file set.

## 0.8.0 — Ready gate (parallel GPT Standards/Spec + verifier + CI on one HEAD)

`opencode-ship@0.8.0` ships the Ready gate contract required by issue #23 (Task 9 in approved plan). The final review is the merge-base-to-HEAD review package; the GPT Standards and Spec reviewers inspect it in parallel; the verifier executes the canonical consumer verification command independently; and the gate refuses any record that is not on the current HEAD. Build cannot self-record both the final review and the verifier — the boundary is enforced by the same-runId check on the runId separate from Build's.

### Verification

- `npm run verify` exits `0` with 317 tests across 34 suites on the v0.8 HEAD.

### Added

- **Final review package + axes.** `src/installer/final-review.js` exposes `buildFinalReviewPackage` (merge-base-to-HEAD), `emitStandardsVerdict` and `emitSpecVerdict` (parallel, separate findings with `standardsKind` / `specKind` discriminators), `shouldRecordFinalReview` (pass only when both axes are non-blocking AND HEAD is current), `isReviewStale` (Ready gate staleness check), `READY_GATE_STATES` (the documented transition set: REVIEW_IN_PROGRESS, STANDARDS_PENDING, SPEC_PENDING, BOTH_PENDING, BOTH_PASSED, BLOCKING_FINDINGS, READY).
- **Ready gate.** `src/installer/ready-gate.js` exposes `recordVerifierOutput` (binds the verifier output to the current HEAD; verifier runs in its own runId separate from Build's), `isVerifierStale` (same staleness rule as final review), `buildCannotSelfRecord` (refuses when the final review and the verifier share a runId — Build cannot self-verify), `isReady` (only true when Standards + Spec verdicts are non-blocking AND the verifier exited 0 AND CI is "pass" — all on the same HEAD), `recordReady` (stamps the Ready state on the consumer's HEAD).

## 0.7.0 — M3 task loop contract

`opencode-ship@0.7.0` ships the M3 task loop contract required by issue #22 (Task 7 in approved plan). The run store persists task state under `.git/opencode-ship/runs/<taskId>/`; the task brief extractor surfaces only the active task plus the plan header; the task reviewer emits separate Spec and Quality verdicts; the build-side commit ownership returns true only when the immutable review package is sealed and the plan hash still matches; the three-round breaker routes a failed third round back to the GPT planning role for a revision; the commit binding appends the immutable range to the run ledger; and the compaction context builder emits the short pointer set the chat hook injects when the context overflows. No plan body, no report body, and no commit diffs ever enter the chat.

### Verification

- `npm run verify` exits `0` with 302 tests across 34 suites on the v0.7 HEAD.

### Added

- **Run store.** `src/installer/run-store.js` exposes `ensureRunDir`, `writeProgress`, `readProgress`, `recordCommitRange` (append-only, dedup-rejected), `readCommitRanges`. Persists run state under `.git/opencode-ship/runs/<taskId>/` with the progress.md / ledger.json / reports/ layout.
- **Task brief + compact context.** `src/installer/task-brief.js` exposes `buildTaskBrief` (extracts the active task from a multi-task plan plus the plan header) and `renderCompactContext` (emits the short pointer set the compaction hook injects into chat).
- **Task reviewer.** `src/installer/task-reviewer.js` exposes `emitSpecVerdict`, `emitQualityVerdict` (separate verdicts with `specKind` / `qualityKind` discriminators), `shouldCommit` (only non-blocking on both sides), `assembleReviewPackage` (writes the immutable package to `reports/review-package.json`), `readReviewPackage`.
- **Build-side commit ownership.** `src/installer/build-ownership.js` returns true only when both verdicts are non-blocking AND the sealed review package is on disk AND the plan hash still matches.
- **Three-round breaker.** `src/installer/three-round-breaker.js` exposes `MAX_FIX_ROUNDS = 3` and `shouldRequestPlanRevision` (returns true only when `fixRound >= 3`).
- **Compaction context.** `src/installer/compaction.js` exposes `buildCompactionContext` and `compactContextForRun` (reads the ledger entry count from disk and merges it with the caller-supplied pointer set).
- **Commit binding.** `src/installer/commit-binding.js` re-exports the run-store `recordCommitRange` as `recordApprovedCommit` so Build can call one name per role.

## 0.6.0 — Durable plan artifact + Plan Mode integration

`opencode-ship@0.6.0` ships the durable plan artifact and the Plan Mode permission integration required by issue #21. The runtime now supports the GPT-to-MiniMax handoff end-to-end: a planning sub-agent can write a hash-verified plan to `.git/opencode-ship/plans/<slug>/revision-NNNN.json`, mirror it to the parent issue as a marked comment, and run with a deny-first, narrow-allow permission block that prevents it from touching source/config/docs.

### Verification

- `npm run verify` exits `0` with 283 tests across 34 suites on the v0.6 HEAD.

### Added

- **Plan artifact.** `src/installer/plan.js` declares the plan schema (version, revision, parentIssue, baseSha, architecture, global constraints, file responsibilities, ordered tasks with interfaces / testSeams / commands / expectedEvidence, acceptance, out of scope, recovery). `validatePlan` is fail-closed; `computePlanHash` produces a stable SHA-256 over the canonical content; `canRevise` enforces the append-only N+1 rule; `planNeedsPlaceholderReview` flags any `<placeholder>` marker so a final-reviewer can refuse approval.
- **Plan persistence.** `src/installer/plan-store.js` writes, reads, and lists plan revisions under `.git/opencode-ship/plans/<planSlug>/revision-NNNN.json`. The store refuses to overwrite or skip revisions.
- **Plan issue mirror.** `src/installer/plan-mirror.js` posts the approved plan to the parent issue as a marked comment with the stable `opencode-ship-execution-handoff:v1` marker, the plan hash, and the revision. Retries with linear backoff. The client is injectable so tests run without `gh`.
- **Engineering config.** `src/installer/engineering-config.js` validates the user config (`models.{planner,builder,finalReviewer}` and `plans.{root,mirrorToIssue}`) and resolves model roles with documented defaults. Strict mode throws on missing roles.
- **Plan Mode permission block.** `src/installer/plan-mode-permissions.js` produces the deny-first, narrow-allow permission set documented in the approved plan: bash / webfetch / task.plan-agent / task.build-agent deny, edit / write allow only `.git/opencode-ship/plans/**`.
- **OpenCode config integration.** `src/installer/root-config.js` gains `applyPlanModeOwnership` which injects the Plan Mode block under `agent.plan.permission` on the consumer's `opencode.json` when the active profile is `engineering`. Captures the previous value so uninstall can restore it.
- **Executor wiring.** `src/installer/executor.js` and `planner.js` thread the active profile through to the planner so core consumers never see the Plan Mode block.

## 0.5.0 — Engineering profile content

`opencode-ship@0.5.0` ships the engineering profile content required by issue #20. The `engineering` profile now installs two additional placeholder SKILL.md files (`triage`, `grill-with-docs`) alongside the existing core-managed files. The real SKILL.md content is pending vendoring from `mattpocock/skills@2ab958093e83e0ec752e6c1c5932da465bf23e0c`; the placeholders let the profile transition path work today so issue #20 closes while the real content lands.

### Verification

- `npm run verify` exits `0` with 242 tests across 34 suites on the v0.5 HEAD.

### Changed

- **Catalog gains two engineering-only entries.** `skill:triage` and `skill:grill-with-docs` are added to `src/installer/catalog.js` with `profiles: ["engineering"]`. `core` consumers never see them; `init --profile engineering` installs both.
- **Manifest records the new entries.** `vendor/sources.json` gains two entries pointing at `assets/skills/triage/SKILL.md` and `assets/skills/grill-with-docs/SKILL.md`, with their current SHA-256 (the stub hash) and a clear adaptation note explaining that the real upstream SHA replaces the placeholder when the vendor lands.
- **THIRD_PARTY_NOTICES.md surfaces the attribution.** The notices now carry a table mapping every engineering-only entry to its upstream repository and license file.

### Added

- **`assets/skills/triage/SKILL.md` and `assets/skills/grill-with-docs/SKILL.md`.** Two placeholder files describing the vendored contract. `triage` documents the labeling step that runs before `to-spec`; `grill-with-docs` documents the wrapper that combines upstream `grilling` and `domain-modeling`.

## 0.4.0 — Profile-aware installer foundation

`opencode-ship@0.4.0` adds the profile-aware installer foundation that issue #18 requires. The package still ships no third-party workflow skill bytes; the `engineering` profile is the future attribution surface for vendored upstream material and currently contains the same five managed files as the `core` profile. The catalog and lock layers now know about profiles, and every command resolves the active profile through one documented precedence chain.

### Verification

- `npm run verify` exits `0` with 226 tests across 34 suites on the v0.4 HEAD.

### Added

- **Profile model.** `src/profile.js` declares `PROFILES = ["core", "engineering"]` and exports `resolveProfile({ cli, config, lock })` for the documented precedence (CLI > ship.config > lock > default). Unknown profiles throw a descriptive `Error` so the CLI can surface them as `exit 2`.
- **`--profile` CLI flag.** Every subcommand (`init`, `diff`, `update`, `doctor`, `uninstall`) accepts `--profile <name>`; parse errors emit to `stderr` and return `exit 2`.
- **Lock schema v2.** `CURRENT_LOCK_SCHEMA` is bumped to 2. Newly written locks always carry `manager.profile`; v1 locks (no profile field) still validate as legacy core so v0.3 consumers can upgrade without manual migration. The `ship-lock.schema.json` `enum` allows `[1, 2]` for both `contractVersion` and `manager.schemaVersion`.
- **`ship.config.json .profile`.** The user config schema accepts an optional `profile` enum (`core | engineering`). The profile is loaded by the same precedence chain as the lock.
- **Profile-aware catalog.** Every `CATALOG` entry declares a `profiles` array. `filterCatalogByProfile(catalog, profile)` returns the subset that ships under the active profile; `validateCatalog` rejects entries that reference unknown profiles.
- **Profile-aware doctor.** The new `profile footprint` check scopes asset presence to the active profile; `package integrity` continues to check the full catalog so the maintainer can still see drift in the other profile.
- **Error to `stderr`.** CLI argument-parsing errors are now written to `stderr` (was `stdout`) so consumers can detect parse failures by exit code alone.

## 0.3.0 — Installer hardening and release pipeline

`opencode-ship@0.3.0` hardens the installer for the public registry. This is the v0.3 installer foundation with the `core` profile only; it carries no third-party workflow skill bytes. The package is now fully consumable from npm with provenance. The catalog installs the five managed files plus the two generated artifacts (`ship.config.json`, `ship.lock.json`), and adds tighter guards around every existing one. The plugin target is `.opencode/plugins/opencode-ship.js` so OpenCode auto-loads it from the plural directory; root-config pointer ownership is recorded for every installer-owned entry so the future v0.4 opt-in `engineering` profile can restore previous values on uninstall. v0.3 is the approved slice shipped by parent spec `Viktorxyz/opencode-ship#16` and plan revision `f85bae931d9eed7763e2f6f4dc68e5fad71bdd38c8a667fc9ffe78b5290200be`.

### Verification

- `npm run verify` exits `0` with 190 tests across 34 suites on the v0.3 HEAD.
- `npm pack` and the extracted-tarball smoke both succeed; the bundled plugin registers the canonical nine `delivery_*` tools.

### Changed

- **Single-source version.** `src/version.js` is the canonical home for `PACKAGE_VERSION` and `TEMPLATE_SET`. It reads `package.json` directly when running from source and falls back to the esbuild-inlined `process.env.OPENCODE_SHIP_VERSION` for the bundled CLI.
- **Robust package root resolution.** `src/installer/package-root.js` walks upward from `import.meta.url` until it finds a `package.json` whose `name` is `opencode-ship`, so the catalog resolves the correct source path whether the installer is loaded from `src/installer/` or from the bundled `dist/cli.js` / `dist/plugin.js`.
- **Catalog-driven installer.** `src/installer/catalog.js` declares a stable `id` for every managed asset (`plugin:opencode-ship`, `agent:delivery-reviewer`, `agent:delivery-verifier`, `skill:delivery-workflow`, `skill:planning-research-checkpoint`), each with a `.opencode/`-rooted target path and a `mode: 0o644` policy. `validateCatalog()` checks unique IDs, unique paths, source existence, non-empty file size, allowed kind set, source containment within the package root, and uniform mode; the planner and doctor consume the same array, so adding a managed file is a one-line catalog change.
- **Fail-closed on missing source.** `init`, `diff`, and `update` invoke `validateCatalog()` and translate any failure to `exit 4`. The installer no longer produces a zero-byte placeholder when an asset source is missing.
- **Lock validator.** `src/installer/lock.js` exposes `validateLock()` and `readValidatedLock()`. The lock schema version is enforced (`CURRENT_LOCK_SCHEMA = 1`); an unsupported `manager.schemaVersion` or `contractVersion` returns `kind: "schema"` for the installer to map to `exit 5`; an integrity mismatch maps to `kind: "integrity"`; a malformed shape maps to `kind: "shape"`. `init`, `diff`, `update`, and `uninstall` now route through `readValidatedLock()` so an invalid or unsupported lock can never be silently treated as a fresh install.
- **Read-only `diff`.** The migration detector in `src/installer/migration.js` returns a `proposedConfigSeed` instead of writing to disk; `planConfigSynthesis()` consumes the seed only when `init`/`update` actually commit.
- **Delete operations reach the transaction layer.** `stageFiles()` in `src/installer/executor.js` forwards `delete` plans to `executePlan()`. The transaction layer journals and rolls back deletes so a downgrade or asset removal produces an honest, recoverable change.
- **Real transaction recovery.** `src/installer/transaction.js` writes a sibling backup of every target before promoting a staged file, journals the backup path only, and rolls back in reverse on failure. Recovery on startup replays the same journal so a crash mid-transaction is recovered automatically.
- **Root-config pointer ownership.** Every installer-owned JSON pointer is recorded in the lock under `manager.rootDocuments[].pointers[]`, including equal-existing leaves. v0.3 records ownership; v0.4 restores the previous values on uninstall.
- **Doctor is catalog-driven.** `src/installer/commands/doctor.js` walks `CATALOG` instead of hard-coded paths and adds a `package integrity` check that re-runs `validateCatalog()`. Drift and missing assets are reported once per asset. Exit codes now distinguish `3` for lock integrity/shape, `4` for package integrity, `5` for an unsupported lock schema.
- **Version fallbacks centralised.** `src/version.js` resolves from `package.json` for source-tree callers and from the esbuild-inlined `process.env.OPENCODE_SHIP_VERSION` for the bundled CLI.
- **Build hygiene.** `scripts/build.mjs` writes the temporary `tsconfig.dts.json` under `.tmp/`, removes it in `finally`, and runs `rm -rf .tmp/` at the end. The previously tracked `tsconfig.dts.json` is removed from the working tree and appended to `.gitignore`.
- **Lint and format-check roots.** `scripts/lint.mjs` and `scripts/format-check.mjs` scan `assets/` instead of the legacy root `agents/` and `skills/` directories. The `assets/` tree is the only place bundled agents and skills live.
- **Release workflow.** `.github/workflows/release.yml` validates that the tag matches `package.json#version`, validates `package-lock.json` and `package.json` carry the same version, refuses to republish an existing npm version, renames the tarball to `opencode-ship-<tag>.tgz`, and gates publication on `npm run verify`. The trusted-publisher identity is `Viktorxyz/opencode-ship`; `id-token: write` is granted to the job.
- **Repository identity.** Schema `$id` URLs, the package homepage, repository URL, and bugs URL all point at `https://github.com/Viktorxyz/opencode-ship/…`. The previously published `0.2.0` and `0.2.1` were produced from the `Viktorxyz/opencode-delivery` GitHub repo; v0.3.0 is the first release from `Viktorxyz/opencode-ship`.
- **Publishing policy.** `publishConfig.access = "public"` and `publishConfig.provenance = true` are set in `package.json`.
- **Removal of unused CLI flag.** The unset `--config` flag is removed from `cli-args.js`; the planned v0.4 profile flag will be added to a released version with the documented behavior.

### Added

- `src/version.js` centralises `PACKAGE_VERSION` and `TEMPLATE_SET`.
- `src/installer/package-root.js` resolves the package root independently of the source/bundle dichotomy.
- `src/installer/catalog.js#validateCatalog()` is the new fail-closed validation surface; the thrown error carries structured `issues` and a `catalogValidation` flag.
- `src/installer/lock.js#validateLock()` and `readValidatedLock()` distinguish "fresh install", "supported lock", "unsupported schema", "tampered lock", and "malformed lock".
- `src/installer/migration.js` returns a `proposedConfigSeed`; `planConfigSynthesis()` consumes it instead of branching on legacy state.
- `tests/installer/catalog.test.mjs`, `tests/installer/lock-validation.test.mjs`, `tests/installer/root-config.test.mjs`, `tests/installer/migration-pure.test.mjs`, and `tests/release/release-metadata.test.mjs` exercise the new contracts.
- `tests/package/packed-artifact.test.mjs` extracts the npm tarball into a clean directory and runs its bundled CLI to `init` a fresh Git repository, asserting the plugin path, the five managed files, the lock, and the pointer records.
- `THIRD_PARTY_NOTICES.md` records that v0.3 contains no third-party skill bytes and reserves the attribution surface for the v0.4 `engineering` profile that introduces them.
- `scripts/prepack.mjs` runs `validateCatalog()` and verifies every required packaged artifact before publishing.

### Fixed

- `packed-artifact` smoke test now runs `init --force-root-config` end-to-end from the extracted tarball.
- `diff` against a v0.2.1 consumer briefly wrote `ship.config.json` to disk; `diff` is now strictly read-only even when the migration detector would have seeded one.
- The legacy migration seed now emits a config that matches the canonical consumer shape (`Viktorxyz/leo`, `pnpm`, `pnpm verify:workspace`, the v0.3 cleanup shape) instead of `"origin"` / `"npm"` / legacy `cleanup.requires`.
- Lock entries with `sha256: null` no longer reach `writeLock`; the planner/executor no longer produce a lock whose integrity digest silently mismatches its declared hashes.
- Stale `tsconfig.dts.json` no longer gets tracked; the build artifact is now confined to `.tmp/`, which is gitignored.
- The plugin target is pluralized to `.opencode/plugins/opencode-ship.js` so OpenCode auto-loads it from the default project plugin directory; the previously-tracked singular directory is removed.

## 0.2.0 — npm-distributed installer release

`opencode-ship@0.2.0` replaces the v0.1.x copy-the-shim workflow. The package is now an npm-distributed CLI plus a self-contained OpenCode plugin. Run `pnpm dlx opencode-ship@latest init` from any consumer repo to materialise everything needed for the delivery workflow.

### Changed

- **Package name and public API.** The package is now `opencode-ship` (was `opencode-delivery`). The package root exports the bundled OpenCode plugin; the previous library surface is still reachable through `opencode-ship/core`.
- **`pnpm dlx opencode-ship@latest <command>`.** Five idempotent subcommands: `init`, `diff`, `update`, `doctor`, `uninstall`. Manual copying is no longer required.
- **Self-contained plugin.** `dist/plugin.js` is a single ESM bundle that inlines `@opencode-ai/plugin`. The nine `delivery_*` tools are registered against the bundled tool helper, no consumer-side wrapper is needed.
- **User-owned config + managed lock.** `.opencode/ship.config.json` is user-owned and preserved across updates; `.opencode/ship.lock.json` records installed version, schema version, managed paths, SHA-256 hashes, and an integrity digest.
- **Hash-based reconciliation.** Every managed file's previous lock hash, current disk hash, and desired hash determine the action. Modified managed files are refused with a precise conflict report, never silently overwritten.
- **Recoverable multi-file transactions.** Staged writes, sibling temporary files, journaled backups, and atomic rename per file. Pre-commit failures roll back in reverse order. The lock is promoted last as the commit marker.
- **Build permissions only.** `init` merges only Build-agent delivery permissions into the root `opencode.json` (or `.jsonc`); everything else is preserved untouched.
- **`init` auto-runs `doctor`.** After a successful commit, `init` runs the doctor checks and embeds the result in the JSON envelope (`doctor`, `doctorChecks`). Pass `--strict-doctor` to fail init when the doctor reports unhealthy checks.
- **Post-merge cleanup is immediate.** Successful merge triggers `delivery_cleanup` automatically. Failures persist `cleanupPending` in the lock; the next delivery task or plugin startup retries the queue.
- **Verifier permission isolation.** The verifier's frontmatter now explicitly allows only `delivery_verify` and denies every other `delivery_*` tool, mirroring the reviewer.
- **Models.** Agents inherit the consumer's default model; no hardcoded provider/model pin.
- **Schema files published.** `project-adapter.schema.json`, `ship-config.schema.json`, and `ship-lock.schema.json` are accessible through `opencode-ship/schema/*` exports.
- **Reviewer change-of-SHA guard.** Reviewer must capture the PR head SHA before recording; mismatch returns `head-mismatch` and `missing-head-sha`.
- **`gh pr view` no longer requests the unsupported `merged` field.** `merged` is now derived from `state === "MERGED"` (falling back to a non-null `mergedAt`), so the merge path is portable across `gh` 2.x versions where the field may be missing.
- **Verification pipeline.** `npm run verify` runs `format:check`, `lint`, `typecheck`, `build`, and the auto-discovered test suite against all `tests/**/*.test.mjs`.
- **Packed-artifact smoke test.** `tests/package/packed-artifact.test.mjs` runs `npm pack`, inspects the file list, extracts the tarball, copies the bundled plugin into an isolated consumer with no `node_modules`, and asserts that the plugin loads with exactly nine tool definitions.
- **Fail-closed `prepack`.** `scripts/prepack.mjs` requires `esbuild` and `tsc`, builds the project, and verifies every required build artifact before publishing.

### Added

- **Install manifests and commands.** `init`, `diff`, `update`, `doctor`, `uninstall` CLI commands; exit codes 0–5.
- **JSON-pointer ownership** for the Build-agent permission block; the installer's edits are reversible from the lock.
- **`--force-root-config`** flag that synthesises a minimal `opencode.json` with installer-owned permissions when the consumer has none.
- **`--strict-doctor`** flag that turns doctor issues into a hard init failure.
- **`ship.config.json`** with a nested shape (`project`, `delivery`) and a flat legacy-adapter compatibility layer in `src/installer/ship-adapter.js`.
- **Migration** from legacy v0.1.x consumers (`.opencode/delivery.json`, `.opencode/delivery.lock.json`, generic `delivery.ts` shim). Migration does not delete legacy artifacts and refuses destructive changes when customised.
- **Agent and skill discovery** tests (`tests/agents/delivery-reviewer-contract.test.mjs`, `tests/agents/delivery-verifier-contract.test.mjs`, `tests/agents/reviewer-permission-boundary.test.mjs`, `tests/agents/skill-discovery.test.mjs`).
- **Installer plugin-load smoke test** (`tests/plugin/plugin-load.test.mjs`) that imports the bundled artifact and asserts exactly nine tool definitions.

### Fixed

- The legacy v0.1.x commit-pinned shim left consumers reading `opencode-delivery` from a vendored `.opencode/plugin/delivery.ts`; v0.2.0 removes that requirement and centralises everything in `dist/plugin.js`.
