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
