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
