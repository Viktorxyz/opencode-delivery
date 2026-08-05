---
name: handoff
description: Produce a compact handoff payload that the next session can resume from without a chat summary.
---

# handoff

The handoff payload is the Ship compact resume block, not a
narrative. It contains:
  - workflow id, issue number, PR number (or null),
  - lifecycle state, branch, worktree path,
  - HEAD SHA, plan path + revision + hash,
  - completed tasks as `taskId:commitSha` pairs,
  - active task id, state, and round,
  - pending gate,
  - child session ids and states,
  - todos by status,
  - last event sequence and hash,
  - the exact resume command.

Never include plan bodies, reviews, diffs, command output, or
secrets in the handoff payload.
