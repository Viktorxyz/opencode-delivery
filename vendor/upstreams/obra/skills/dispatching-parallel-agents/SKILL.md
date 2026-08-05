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
