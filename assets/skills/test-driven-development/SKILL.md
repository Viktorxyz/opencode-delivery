---
name: test-driven-development
description: Write the failing test first; observe the expected failure; then implement the minimum behaviour that makes the test pass.
---

# test-driven-development

The build loop is: red, green, refactor. The failing test
is the first thing the task brief produces. The implementation
is the smallest change that makes the test pass. Refactors land
in a separate commit with their own test coverage.

Test order is enforced by the task brief and by Ship's
per-task commit policy; the controller rejects a commit whose
files are not a subset of the reviewed task's paths.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. Execution is driven by the deterministic
Ship controller; the cheap builder (`minimax/MiniMax-M3`) cannot
commit, push, mutate GitHub, mark Ready, or merge. The
verification-before-completion rule is enforced by
`delivery_verify`, not by the model self-asserting completion.
