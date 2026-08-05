---
name: to-tickets
description: Cut the parent spec into vertical tickets that ship independently and stack into the final feature.
---

# to-tickets

Each ticket is a vertical slice: it touches every layer of
the stack required to deliver one acceptance criterion. Tickets
are linked through the typed `delivery_issue_link` tool with
`blocks` / `parent-of` relationships. The parent spec remains
the source of truth; the tickets are the children.

Tickets are sized so each one fits in a single task brief
passed to the cheap builder.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. The strong planner child session is
configured with `openai/gpt-5.6-sol` and the durable workflow
state lives under `<git-common-dir>/opencode-ship/`. All
GitHub mutations go through Ship's typed tools; never use
`gh api` or raw shell.
