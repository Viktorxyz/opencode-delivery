---
name: brainstorming
description: Explore the goal space before committing to a design.
---

# brainstorming

List every plausible approach to the goal. For each,
  capture the upside, the downside, and the open question that
  would resolve whether it is the right choice. Stop when the
  list stops producing new approaches or when the user picks
  one. The chosen approach is the input to `writing-plans`.

  Never start coding before the user has picked an approach.
  Never pick an approach for the user.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. Execution is driven by the deterministic
Ship controller; the cheap builder (`minimax/MiniMax-M3`) cannot
commit, push, mutate GitHub, mark Ready, or merge. The
verification-before-completion rule is enforced by
`delivery_verify`, not by the model self-asserting completion.
