---
name: setup-engineering-workflow
description: Configure the consumer's opencode-ship plan to use the Matt + Superpowers workflows.
---

# setup-engineering-workflow

The consumer's first run of this skill scaffolds the
`opencode-ship` profile, the plan mirror, and the durable run
state. The strong planner child session is launched with the
exact plan bytes for the issue at hand; the durable run state
records every dispatch, every review verdict, and every commit.

Subsequent runs of this skill never re-scaffold an existing
project. They verify the current profile, refresh the run state
identifiers, and re-publish the strong-planner model pointer.

## Ship integration

This skill is part of the engineering profile shipped by
`opencode-ship@1.0`. The strong planner child session is
configured with `openai/gpt-5.6-sol` and the durable workflow
state lives under `<git-common-dir>/opencode-ship/`. All
GitHub mutations go through Ship's typed tools; never use
`gh api` or raw shell.
