---
name: receiving-code-review
description: Receive review feedback as data; address blocking findings, do not argue.
---

# receiving-code-review

Every blocking finding is reproduced as a test before the
fix. Non-blocking findings are recorded as TODOs in the
follow-up issue. The fix is dispatched as a new task through
Ship's deterministic controller; the build model does not
self-commit the fix.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. Execution is driven by the deterministic
Ship controller; the cheap builder (`minimax/MiniMax-M3`) cannot
commit, push, mutate GitHub, mark Ready, or merge. The
verification-before-completion rule is enforced by
`delivery_verify`, not by the model self-asserting completion.
