# ADR 0001 — `opencode-ship`: npm-distributed, single-command installer

Status: Accepted

## Context

The current package, `opencode-delivery`, is a private source-level ESM
core library. Consumer projects adopt it by copying a project plugin
shim into `opencode.json` and pinning a Git commit hash. Each new
release is a manual PR into every consumer repo. There is no CLI, no
generated plugin bundle, no managed-file policy, and no upgrade path
short of consumer-side edits.

Consumer pain observed in the wild:

- Every onboarding requires editing `opencode.json`, copying the shim,
  copying the two agents, copying the two skills, copying the
  `delivery.json` adapter, copying the workflow lock, and remembering to
  rename the plugin when the package moves.
- Updates require a Git ref ping and a manual diff; tooling cannot
  reason about who owns which file.
- Cleanup is only triggered manually and silently fails when the local
  branch head SHA drifts from the manifest.

## Decision

Re-establish the package as `opencode-ship`, a publishable npm module
with three surfaces:

1. A self-contained compiled ESM OpenCode plugin at the package root
   (`opencode-ship`) that registers the canonical nine `delivery_*`
   tools and removes the need for any consumer-side plugin wrapper.
2. A first-class CLI (`opencode-ship` binary) materialising every
   required asset in the consumer repo through five idempotent commands.
3. A `opencode-ship/core` subpath that preserves the existing library
   surface so consumer scripts that already import from the package can
   migrate at their own pace.

### Managed-file policy

Five output classes are installer-managed and recorded in the lock:

- `.opencode/plugins/opencode-ship.js` — the bundled plugin.
- `.opencode/agents/delivery-reviewer.md`,
  `.opencode/agents/delivery-verifier.md`.
- `.opencode/skills/delivery-workflow/SKILL.md`,
  `.opencode/skills/planning-research-checkpoint/SKILL.md`.
- `.opencode/ship.config.json` — user-owned, written only on the
  first `init` if missing.
- `.opencode/ship.lock.json` — installer-managed.

Root `opencode.json` / `opencode.jsonc` is a shared document. The
installer owns only the Build-agent delivery permissions and the
delivery subagent delegation allow-list; everything else stays.

`update` only replaces managed files whose hashes still match the
previous manifest. Modified managed files are refused with a precise
conflict report; the user either restores the upstream bytes (the
preferred repair) or opts into `--replace-managed`. We never silently
overwrite.

### Reconciliation algorithm

For each managed target, three hashes are computed:

- `B` = the SHA-256 stored in the previous lock for that path.
- `C` = the SHA-256 of the bytes currently on disk.
- `D` = the SHA-256 of the bytes we want to install.

The combination determines the action:

| Condition | Plan |
| --- | --- |
| No lock, target absent | `create` |
| No lock, target present | `report` (unowned collision) |
| `C == B == D` | `noop` |
| `C == B`, `D != B` | `update` |
| `C == D`, `C != B` | `converge` (refresh lock only) |
| `C != B`, `C != D` | `conflict` (refuse) |
| Target removed, `C == B` | `delete` |
| Target removed, `C != B` | `conflict` |

Conflict semantics are uniform across `init`, `update`, and `uninstall`.

### Transactions

Multi-file updates are recoverable but not truly atomic. The transaction
layer:

1. Acquires an exclusive repository lock file under `.git/opencode-ship/`.
2. Re-reads and re-hashes every target before staging.
3. Stages each target as a sibling temporary file and `fsync`s it.
4. Writes a journal recording original paths, backup paths, hashes,
   and operation order.
5. Renames each managed target to a backup, then promotes the staged
   copy into place, then `fsync`s the parent directory.
6. Promotes the new lock last as the commit marker.
7. Removes backups and journal after commit.

Pre-commit failures roll back in reverse order. Post-commit failure
treats the plan as committed and surfaces a degraded-cleanup warning;
the journal is cleaned on the next mutating command.

### CLI surface

```
opencode-ship init    [--root <path>] [--config <path>] [--force-config]
opencode-ship diff    [--root <path>] [--json] [--config <path>]
opencode-ship update  [--root <path>] [--json] [--replace-managed]
opencode-ship doctor  [--root <path>] [--json]
opencode-ship uninstall [--root <path>] [--json] [--purge-config]
opencode-ship --version
```

Exit codes:

- `0` success / no-op
- `1` expected negative result (`diff` saw changes; `doctor` unhealthy)
- `2` invalid input, unsupported project, ambiguous detection
- `3` ownership/hash/structural conflict
- `4` filesystem, staging, rollback, or transaction failure
- `5` unsupported lock/config schema

### Plugin + cleanup hardening

The bundled plugin no longer assumes `minimax/MiniMax-M3`; model
inheritance is the default. The verifier agent gains explicit denials
for the other eight tools so isolation is symmetric to the reviewer.
The Build agent gains explicit denials for `delivery_review` and
`delivery_verify`, plus an `ask` rule for `delivery_merge`. The
GitHub driver replaces the unsupported `gh pr view --json merged` field
with a typed `gh pr view ... --json state,mergedAt`.

Post-merge cleanup moves to immediate, atomic-enough execution after
an explicit user-authorised merge: validate the preconditions, persist
`cleanup-pending`, perform the worktree removal and CAS-style branch
deletion, seal the manifest, retry on the next delivery task if any
step failed. No force removal and no OpenCode restart.

### Compatibility strategy

Legacy `.opencode/delivery.json`, `.opencode/delivery.lock.json`, the
two agents, the two skills, and the generic `delivery.ts` wrapper
shape are recognised. Migration is opt-in by running `init` from a
checkout that already has those files. The consumer keeps the
existing manifest directory (`opencode-delivery/` under the Git common
dir) untouched to avoid stranding in-flight deliveries.

## Consequences

- Consumer repo touches only `.opencode/` and root
  `opencode.json`/`.jsonc`. Initial onboarding becomes
  `pnpm dlx opencode-ship init`.
- Upgrades become `opencode-ship update`, with conflicts surfaced
  instead of overwritten.
- The library surface stays public through `opencode-ship/core`.
- v0.1.x becomes a legacy package; v0.2.0 is the first npm-distributed
  release.
- The lock introduces a migration concern that the installer's
  `doctor` must surface if the lock format is too old.
- A `cleanupPending` schedule runs only on consumer demand (the next
  delivery start), never on package installation.

## Non-goals

- Publishing to a registry is deferred until this PR is approved.
- Migrating Leo into `opencode-ship` consumers is a separate follow-up.
- Changing the lifecycle state machine semantics.
