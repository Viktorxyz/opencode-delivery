---
description: Start a delivery workflow. Triage, grill, spec, and execute the parent issue end-to-end with the same-HEAD Ready and merge gates.
---

# ship-deliver

`ship-deliver <issue-number>` is the canonical entry point
for a delivery workflow. The controller:

1. Resolves the parent issue, the strong planner model, and
   the durable workflow state.
2. Dispatches the strong planner child session to produce a
   PlanV2 contract.
3. Seeks explicit user approval through `ship_plan_approve`.
4. Mirrors the plan to the issue.
5. Drives each task through the cheap builder, the task
   reviewer (Spec + Quality), and the controller commit
   loop.
6. On the final task, dispatches the parallel Standards and
   Spec final reviewers against one merge-base-to-HEAD
   package, runs the verifier in an independent session, and
   binds the Ready gate to the same HEAD.
7. Stops at Ready and waits for a separate explicit
   `merge it` request from the user.

The command never force-pushes, never hard-resets, never
stashes, and never deletes a worktree before the merge
lands. The strong planner never edits source files; the
cheap builder cannot commit, push, mutate GitHub, mark
Ready, merge, clean worktrees, or record reviews.
