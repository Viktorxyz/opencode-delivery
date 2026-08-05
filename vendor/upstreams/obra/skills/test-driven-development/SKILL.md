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
