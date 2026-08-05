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
