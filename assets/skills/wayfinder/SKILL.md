---
name: wayfinder
description: Find the relevant code in the consumer's repository without reading the whole thing.
---

# wayfinder

Use the consumer's preferred code-search tool (ripgrep by
default). Search for the entities from the domain model first.
For each entity, find the file that defines it, the file that
tests it, and the file that consumes it. The output is a
compact map of `entity -> {definition, test, consumer}` so the
next skill can target its edits without an unbounded read.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. The strong planner child session is
configured with `openai/gpt-5.6-sol` and the durable workflow
state lives under `<git-common-dir>/opencode-ship/`. All
GitHub mutations go through Ship's typed tools; never use
`gh api` or raw shell.
