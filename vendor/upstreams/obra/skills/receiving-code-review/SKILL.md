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
