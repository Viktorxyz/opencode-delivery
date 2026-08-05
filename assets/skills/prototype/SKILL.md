---
name: prototype
description: Sketch a small throwaway prototype when the right approach is unclear, before committing to a vertical ticket.
---

# prototype

The prototype lives in the consumer's worktree and is
deleted before the final commit. It is a learning artifact, not
a deliverable. The output is a short note: what was tried, what
worked, what did not, and which approach the vertical ticket
should now implement.

The prototype is never reviewed as a final deliverable. It is
always followed by a vertical ticket built on the lessons.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. The strong planner child session is
configured with `openai/gpt-5.6-sol` and the durable workflow
state lives under `<git-common-dir>/opencode-ship/`. All
GitHub mutations go through Ship's typed tools; never use
`gh api` or raw shell.
