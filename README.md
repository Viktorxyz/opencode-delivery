# opencode-ship

> npm-distributed OpenCode installer and delivery plugin: a single command materialises the lifecycle plugin, reviewer/verifier agents, and skills into any consumer repository, with a recoverable lock and never silently overwrites managed files.
>
> **Status:** v0.2.0. The installer is now a `pnpm dlx opencode-ship@latest <cmd>` workflow. Five idempotent CLI commands manage a managed-file lock, a transactional promoter, and a compiled ESM plugin that registers the canonical nine `delivery_*` tools. Post-merge cleanup is immediate and recoverable. All 143 tests and the packed-artifact smoke check pass under `npm run verify`.

---

## What this package is

`opencode-ship` is the npm-distributed successor to `opencode-delivery`. It bundles:

- a **nine-tool OpenCode plugin** that auto-loads from `.opencode/plugin/opencode-ship.js`;
- a **lifecycle state machine** for one issue → one worktree → one PR → one merge → one cleanup;
- a **Git worktree driver** (no rebase-after-push, no force-push, no `--force-with-lease`);
- a **GitHub CLI driver** that talks only to typed `gh pr/issue` verbs (never `gh api`);
- a **project adapter** (`.opencode/ship.config.json`) so any project can declare its own verify/bootstrap/CI commands;
- **reviewer** and **verifier** subagents, both with strictly bounded `delivery_*` permissions;
- a **delivery-workflow** skill that drives the canonical lifecycle;
- a **planning-research-checkpoint** skill that offers a single, optional Deep Research gate per non-trivial plan;
- a **delivery doctor** that validates the adapter, package pin, and OpenCode compatibility;
- an **install/doctor/diff/update/uninstall** CLI with stable exit codes and `--json` envelopes;
- a **.opencode/ship.lock.json** lock that records managed paths, hashes, and the installer-owned JSON pointers;
- **recovery** for interrupted cleanup, half-written state files, and stale worktrees.

The package **does not** own:

- package managers, test commands, linters, docs layout, or CI templates;
- issue-label catalogues, release scripts, or deploy hooks;
- framework- or language-specific expertise.

## Distribution

Published to npm as `opencode-ship`. Consumers install once with `pnpm dlx` (or `npx`) and never edit the file by hand:

```
pnpm dlx opencode-ship@latest init      # install managed files
pnpm dlx opencode-ship@latest update    # apply a packaged upgrade
pnpm dlx opencode-ship@latest diff      # preview what would change
pnpm dlx opencode-ship@latest doctor    # environment and lock audit
pnpm dlx opencode-ship@latest uninstall # remove only the files still matching the lock
```

The plugin auto-discovers from `.opencode/plugin/opencode-ship.js`; the consumer does not add a plugin entry to `opencode.json`. The installer merges only Build-agent permissions into the root `opencode.json` (or `.jsonc`); all other root-config fields remain owned by the user.

### Managed file layout

```
.opencode/plugin/opencode-ship.js
.opencode/agents/delivery-reviewer.md
.opencode/agents/delivery-verifier.md
.opencode/skills/delivery-workflow/SKILL.md
.opencode/skills/planning-research-checkpoint/SKILL.md
.opencode/ship.config.json     # user-owned; written by `init` only if absent
.opencode/ship.lock.json       # installer-managed; drives update + uninstall
```

### Schema files

These JSON Schemas are published and discoverable through the `exports` map:

- `opencode-ship/schema/project-adapter.schema.json`
- `opencode-ship/schema/ship-config.schema.json`
- `opencode-ship/schema/ship-lock.schema.json`

### Legacy migration

Existing consumers of `opencode-delivery@0.1.x` (commit-pinned shim) can run `pnpm dlx opencode-ship@latest init` from the same checkout. Migration recognises `.opencode/delivery.json`, `.opencode/delivery.lock.json`, the two canonical agents, and the generic plugin `.opencode/plugin/delivery.ts`, and adopts them when their bytes match. Legacy artifacts are preserved on disk so a downgrade remains possible; the installer does NOT modify Leo or any other consumer.

## Lifecycle

1. Begin a Build task: the delivery plugin immediately runs any queued post-merge cleanups. Failed cleanups are recorded in `ship.lock.json#cleanupPending` and retried at the next delivery task or plugin startup.
2. Optional Deep Research checkpoint for non-trivial plans.
3. Find or create exactly one issue per PR.
4. Discover the default branch and fetch it.
5. Create a dedicated worktree and branch.
6. Run the project adapter's bootstrap command.
7. Implement and commit.
8. Push and open a draft PR linked to the issue (`Closes #N`).
9. Continue commits/pushes on the same branch.
10. Merge latest default branch into the feature branch before final review.
11. Run independent reviewer on the final HEAD.
12. Run canonical local verification.
13. Push and wait for required remote CI checks.
14. Mark the PR Ready and stop.
15. Explicit "merge it" re-runs the freshness checks and performs the squash merge.
16. The plugin immediately invokes `delivery_cleanup`; failures leave `cleanupPending` for the next session.

## Exit codes

| Code | Meaning |
|---:|---|
| `0` | success / no-op |
| `1` | expected negative result (`diff` saw changes; `doctor` unhealthy) |
| `2` | invalid input, unsupported project, ambiguous detection |
| `3` | ownership / hash / structural conflict |
| `4` | filesystem, staging, rollback, or transaction failure |
| `5` | unsupported lock/config schema |

## Development

`npm run verify` runs `format:check`, `lint`, `typecheck`, the build, and the auto-discovered test suite. 143 tests cover lifecycle, drivers, recovery, doctor, agents, the installer CLI, plugin registration, and the packed-artifact smoke test.

```
npm install
npm run build
npm run verify
```

## Status and licensing

- **License:** MIT. See `LICENSE`.
- **Versioning:** SemVer. v0.2.0 is the first npm-distributed release. Subsequent releases follow standard `<major>.<minor>.<patch>` rules.
- **Compatibility:** the bundled plugin targets `@opencode-ai/plugin >= 1.15.5` and OpenCode `>= 1.15.5`.
