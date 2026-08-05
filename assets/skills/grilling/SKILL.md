---
name: grilling
description: Persistently ask the user one structured question at a time until the goal is unambiguous.
---

# grilling

For every ambiguous element of a request, ask exactly one
question. Wait for an answer. Then ask the next. Continue until
the request is a precise, falsifiable goal. The output is a
written list of resolved ambiguities; the list is the input to
the spec step.

Never bundle two questions in one message. Never proceed on
unanswered ambiguity. Never assume defaults the user did not
state.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. The strong planner child session is
configured with `openai/gpt-5.6-sol` and the durable workflow
state lives under `<git-common-dir>/opencode-ship/`. All
GitHub mutations go through Ship's typed tools; never use
`gh api` or raw shell.
