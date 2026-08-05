---
name: verification-before-completion
description: Never claim a task is complete without a passing verifier output on the task's commit.
---

# verification-before-completion

Verification runs the configured command suite, hashes
the output, and binds the result to the task's commit SHA.
The verifier is independent of the builder and the task
reviewer. The build model cannot self-record a passing
verification.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. Execution is driven by the deterministic
Ship controller; the cheap builder (`minimax/MiniMax-M3`) cannot
commit, push, mutate GitHub, mark Ready, or merge. The
verification-before-completion rule is enforced by
`delivery_verify`, not by the model self-asserting completion.
