---
name: systematic-debugging
description: Reproduce, isolate, hypothesise, test, fix; never guess.
---

# systematic-debugging

Every debugging attempt starts with a reproducer that
fails on `HEAD` and passes after the fix. The hypothesis
list is recorded in the run event log. Each hypothesis is
tested by a minimal change; the fix lands only after the
reproducer is green.

Debugging state is durable; the next session can resume the
hypothesis list without a chat summary.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. Execution is driven by the deterministic
Ship controller; the cheap builder (`minimax/MiniMax-M3`) cannot
commit, push, mutate GitHub, mark Ready, or merge. The
verification-before-completion rule is enforced by
`delivery_verify`, not by the model self-asserting completion.
