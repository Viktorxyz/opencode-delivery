---
name: writing-plans
description: Produce a PlanV2 contract: goal, decisions, files, tasks, acceptance, recovery.
---

# writing-plans

The plan is a single object validated by Ship's plan
schema. Every task has: a single objective, a dependency list,
a precondition set, a changes list, an interfaces list, a
tests list, a commands list, an acceptance list, and an exact
commit message.

Plans are immutable once approved. The plan hash is the
identity of the run; later revisions supersede earlier ones
by hash.
