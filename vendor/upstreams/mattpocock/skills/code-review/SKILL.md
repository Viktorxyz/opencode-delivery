---
name: code-review
description: Review a vertical ticket's diff before it lands; record findings as a task reviewer verdict.
---

# code-review

The review uses the same Spec + Quality axes the task
reviewer enforces. Each finding is either:
  - a Spec gap (the change does not satisfy the spec),
  - a Quality concern (the change is correct but the code is
    not in a shippable state).

Findings are submitted through `ship_task_review` with a
single verdict. The cheap builder reads the verdict, addresses
the blocking findings, and resubmits. The deterministic
controller is the only entity that can commit, push, or merge.
