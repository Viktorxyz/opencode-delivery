---
name: triage
description: Categorise incoming work as bug, feature, or refactor; assign triage labels; pick the right planning strategy.
---

# triage

Every new issue gets a triage label and a one-line
categorisation comment before any planning step starts.
Categorisation:
  - bug: an observed behaviour that violates a documented
    invariant,
  - feature: a new capability,
  - refactor: a change that preserves behaviour.

The triage label is written through the typed
`delivery_issue_labels` tool. The categorisation comment is
written through the typed `delivery_issue_comment` tool. Never
use `gh issue edit` or any other raw GitHub command.
