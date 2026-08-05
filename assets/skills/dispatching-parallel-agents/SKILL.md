---
name: dispatching-parallel-agents
description: Dispatch concurrent subagents only when the result has no inter-agent coupling.
---

# dispatching-parallel-agents

The two final-review agents (Standards and Spec) run in
parallel against the same merge-base-to-HEAD package. The
verifier runs in an independent session. Parallel agents never
share state outside the durable run event log; they never
share a child session id.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. Execution is driven by the deterministic
Ship controller; the cheap builder (`minimax/MiniMax-M3`) cannot
commit, push, mutate GitHub, mark Ready, or merge. The
verification-before-completion rule is enforced by
`delivery_verify`, not by the model self-asserting completion.
