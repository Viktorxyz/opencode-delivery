---
name: requesting-code-review
description: Request a review through Ship's typed review tool; never ask in a chat turn.
---

# requesting-code-review

The request includes the task brief, the diff, the test
output, and the verification report. The reviewer returns a
single Spec + Quality verdict through `ship_task_review`. The
builder reads the verdict and either accepts or fixes the
blocking findings.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. Execution is driven by the deterministic
Ship controller; the cheap builder (`minimax/MiniMax-M3`) cannot
commit, push, mutate GitHub, mark Ready, or merge. The
verification-before-completion rule is enforced by
`delivery_verify`, not by the model self-asserting completion.
