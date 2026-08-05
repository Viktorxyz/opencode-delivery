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
