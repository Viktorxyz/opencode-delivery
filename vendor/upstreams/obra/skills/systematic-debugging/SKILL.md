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
