---
name: subagent-driven-development
description: Dispatch subagents through Ship's OpenCode SDK model dispatcher; never invoke model ids ad hoc.
---

# subagent-driven-development

The dispatcher persists the dispatch intent before
creating a child session, persists the child id before
prompting, and reuses both on resume. Subagents can read
repository state and write the active task's files; they
cannot commit, push, mutate GitHub, mark Ready, or merge.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. Execution is driven by the deterministic
Ship controller; the cheap builder (`minimax/MiniMax-M3`) cannot
commit, push, mutate GitHub, mark Ready, or merge. The
verification-before-completion rule is enforced by
`delivery_verify`, not by the model self-asserting completion.
