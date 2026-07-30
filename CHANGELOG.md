# Changelog

All notable changes to `opencode-ship` are recorded here.

## 0.2.0 — npm-distributed installer release

Adopted redesign accepted in the prior planning session. The package is now distributed as a single npm-installable CLI + plugin, replacing the v0.1.x "copy-the-shim" workflow.

### Changed

- **Package name and public API.** The package is now `opencode-ship` (was `opencode-delivery`). The package root exports the bundled OpenCode plugin; `opencode-ship/core` preserves the previous library surface for adapters and legacy scripts.
- **`pnpm dlx opencode-ship@latest <command>`.** Five idempotent subcommands materialise every required asset; manual copying is no longer required.
- **Compiled ESM plugin.** `dist/opencode-ship.js` is a single ESM bundle ready to be auto-discovered from `.opencode/plugin/opencode-ship.js`. The nine `delivery_*` tools are registered against `@opencode-ai/plugin/tool`; no consumer-side wrapper is needed.
- **User-owned config + managed lock.** `.opencode/ship.config.json` is user-owned and preserved across updates; `.opencode/ship.lock.json` records installed version, schema version, managed paths, and SHA-256 hashes.
- **Hash-based reconciliation.** Every managed file's previous lock hash, current disk hash, and desired hash determine the action. Modified managed files are refused with a precise conflict report, never silently overwritten.
- **Recoverable multi-file transactions.** Staged writes, sibling temporary files, journaled backups, and atomic rename per file. Pre-commit failures roll back in reverse order. The lock is promoted last as the commit marker.
- **Build permissions only.** `init` merges only Build-agent delivery permissions into the root `opencode.json` (or `.jsonc`); everything else is preserved untouched.
- **Post-merge cleanup is immediate.** Successful merge triggers `delivery_cleanup` automatically. Failures persist `cleanupPending` in the lock; the next delivery task or plugin startup retries the queue.
- **Verifier permission isolation.** The verifier's frontmatter now explicitly allows only `delivery_verify` and denies every other `delivery_*` tool, mirroring the reviewer.
- **Models.** Agents inherit the consumer's default model; no hardcoded provider/model pin.
- **Schema files published.** `project-adapter.schema.json`, `ship-config.schema.json`, and `ship-lock.schema.json` are accessible through `opencode-ship/schema/*` exports.
- **Reviewer change-of-SHA guard.** Reviewer must capture the PR head SHA before recording; mismatch returns `head-mismatch` and `missing-head-sha`.
- **Driver refinements.** Git worktree creation uses CAS-style `git update-ref -d refs/heads/<branch> <expectedSha>` so post-merge cleanup succeeds after the remote feature branch is deleted; the manifest directory is preserved at `<git-common-dir>/opencode-delivery/manifests/` so in-flight deliveries are not stranded.
- **Verification pipeline.** `npm run verify` runs `format:check`, `lint`, `typecheck`, `build`, and the auto-discovered test suite against all `tests/**/*.test.mjs`.
- **Packed-artifact smoke test.** A new test `tests/package/packed-artifact.test.mjs` runs `npm pack`, inspects the file list, extracts the tarball, and exercises the bundled binary in an empty consumer.

### Added

- **Install manifests and commands.** `install`, `diff`, `update`, `doctor`, and `uninstall` CLI commands; exit codes 0–5.
- **JSON-pointer ownership** for the Build-agent permission block; the installer's edits are reversible from the lock.
- **Migration** from legacy v0.1.x consumers (`.opencode/delivery.json`, `.opencode/delivery.lock.json`, generic `delivery.ts` shim). Migration does not delete legacy artifacts and refuses destructive changes when customised.
- **Agent and skill discovery** tests (`tests/agents/delivery-reviewer-contract.test.mjs`, `tests/agents/delivery-verifier-contract.test.mjs`, `tests/agents/reviewer-permission-boundary.test.mjs`, `tests/agents/skill-discovery.test.mjs`).
- **Installer plugin-load smoke test** (`tests/plugin/plugin-load.test.mjs`) that imports the bundled artifact and asserts exactly nine tool definitions.

### Fixed

- **gh pr view merged blocker.** The GitHub driver no longer depends on `merged` as a required field; the `viewFields()` set is unchanged but the wait-for-merge check is now resilient when the field is missing on older gh versions.
- **Cleanup-after-merged-PR race.** Cleanup preconditions are validated atomically; the agent-owned worktree and local branch are removed only after the manifest is sealed.
- **Deterministic cleanup recovery.** A `merged` manifest that has no PR is recovered when the worktree is clean and the recorded head SHA matches the local head.
- **Stale lockfile / missing adapter schema.** The lockfile is regenerated during npm install; the previously missing `schema/project-adapter.schema.json` is published.

### Compatibility

- Requires Node `>=22.6.0` (matches `engines` and doctor).
- Requires `@opencode-ai/plugin >= 1.15.5 < 2` as a peer dependency (it is provided by OpenCode at runtime).
- The plugin auto-discovers from `.opencode/plugin/opencode-ship.js`; consumers do NOT add a `plugin` entry to `opencode.json` for the bundled plugin (avoid double registration).

### Removed

- The previous source-pinned package layout that required copying `delivery.json`, the project plugin shim, the agents, and the skills by hand.
