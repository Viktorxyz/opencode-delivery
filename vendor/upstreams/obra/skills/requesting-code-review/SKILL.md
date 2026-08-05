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
