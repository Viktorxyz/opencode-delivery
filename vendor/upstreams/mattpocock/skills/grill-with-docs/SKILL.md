---
name: grill-with-docs
description: Run the grilling protocol with the consumer's existing documentation as background context.
---

# grill-with-docs

Before asking the first question, read every README, design
doc, and existing API reference the consumer has. Treat the
documentation as authoritative; the user's answers resolve only
the gaps the documentation does not already cover. The output
is the same resolved-ambiguities list as plain `grilling`, with
each resolution citing the doc section that informed it.
