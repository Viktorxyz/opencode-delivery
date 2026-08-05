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
