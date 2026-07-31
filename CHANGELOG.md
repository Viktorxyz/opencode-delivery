# Changelog

All notable changes to `opencode-ship` are recorded here.

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

- **`gh pr view merged blocker.** The GitHub driver no longer requests the unsupported `merged` field on `gh pr view --json`. `merged` is derived from `state` / `mergedAt` instead.
- **Cleanup-after-merged-PR race.** Cleanup preconditions are validated atomically; the agent-owned worktree and local branch are removed only after the manifest is sealed.
- **Deterministic cleanup recovery.** A `merged` manifest that has no PR is recovered when the worktree is clean and the recorded head SHA matches the local head.
- **Stale lockfile / missing adapter schema.** The lockfile is regenerated during `npm install`; the previously missing `schema/project-adapter.schema.json` is published.
- **Locked JSON parse drift.** Config files generated with extra fields the schema rejected (`inferredFrom`) no longer fail validation; detection now produces schema-compliant output.
- **Hash-corruption in root-config writes.** The order-preserving JSONC walker now merges new keys with the original source order, so existing pointers are not lost on rewrite.

### Compatibility

- Requires Node `>=22.6.0` (matches `engines` and doctor).
- Requires `@opencode-ai/plugin >= 1.15.5 < 2` as a peer dependency (it is provided by OpenCode at runtime).
- The plugin auto-discovers from `.opencode/plugin/opencode-ship.js`; consumers do NOT add a `plugin` entry to `opencode.json` for the bundled plugin (avoid double registration).

### Removed

- The previous source-pinned package layout that required copying `delivery.json`, the project plugin shim, the agents, and the skills by hand.
