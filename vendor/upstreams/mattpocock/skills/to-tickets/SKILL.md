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
