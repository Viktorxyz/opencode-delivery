---
name: to-spec
description: Produce a parent specification document for the goal that downstream tickets can be cut from.
---

# to-spec

Inputs: the resolved-ambiguities list, the domain model.
Output: a single Markdown spec with these sections:
  1. Goal
  2. Non-goals
  3. Acceptance criteria (falsifiable)
  4. Domain model summary (links to the full document)
  5. Open questions
  6. Definition of done.

The spec is the only authoritative parent. Downstream tickets
reference the spec by URL; they never restate it.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. The strong planner child session is
configured with `openai/gpt-5.6-sol` and the durable workflow
state lives under `<git-common-dir>/opencode-ship/`. All
GitHub mutations go through Ship's typed tools; never use
`gh api` or raw shell.
