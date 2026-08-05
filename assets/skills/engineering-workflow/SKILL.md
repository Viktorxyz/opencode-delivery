---
name: engineering-workflow
description: Run the full Matt planning front-half and the Ship execution back-half.
---

# engineering-workflow

Front half (Matt):
  - triage the issue,
  - grill the author until the goal is unambiguous,
  - produce a domain model,
  - write the parent spec,
  - split into vertical tickets.

Back half (Ship):
  - submit the plan to the strong planner child session,
  - seek explicit approval (`ship_plan_approve`),
  - mirror the plan to the issue,
  - drive each task through the cheap builder + task reviewer
    + controller commit loop,
  - bind the final review, verifier, CI, Ready, and merge to
    one HEAD.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. The strong planner child session is
configured with `openai/gpt-5.6-sol` and the durable workflow
state lives under `<git-common-dir>/opencode-ship/`. All
GitHub mutations go through Ship's typed tools; never use
`gh api` or raw shell.
