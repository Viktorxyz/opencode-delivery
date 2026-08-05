---
name: domain-modeling
description: Produce entities, relationships, and invariants for the goal before any code is written.
---

# domain-modeling

Read the spec produced by `to-spec`. Identify the entities
(value objects, aggregates, services). Identify the relationships
between them. Identify the invariants each entity must hold. The
output is a Markdown document with one H2 per entity, one H2 per
relationship, and one H2 per invariant. The document becomes
the first appendix of the parent spec.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. The strong planner child session is
configured with `openai/gpt-5.6-sol` and the durable workflow
state lives under `<git-common-dir>/opencode-ship/`. All
GitHub mutations go through Ship's typed tools; never use
`gh api` or raw shell.
