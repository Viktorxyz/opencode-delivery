---
name: research
description: Investigate the consumer's repository and the opencode-ship plugin to gather the context a vertical ticket needs.
---

# research

Read the spec, the domain model, the wayfinder map, and any
referenced doc. Output a compact research digest per ticket:
  - files to read before writing,
  - existing tests to extend (not duplicate),
  - existing utilities to reuse,
  - shared contracts the change must honour.

The digest is appended to the plan bytes; the cheap builder
sees it on the next dispatch.
