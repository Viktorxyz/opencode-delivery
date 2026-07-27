---
name: planning-research-checkpoint
description: Offers a single, optional ChatGPT Deep Research gate before non-trivial plans proceed to implementation. Use when the parent agent has finished the plan-mode brief and the work touches architecture, lifecycle design, or an unfamiliar domain.
---

# planning-research-checkpoint

You trigger exactly once per non-trivial planning session. Trivial sessions (typo fixes, docstring changes, single-file edits, follow-up PRs on already-decided work) skip this gate silently.

## When you trigger

- The plan touches architecture, lifecycle, API surface, or test strategy
- The plan consumes external standards (OpenCode, GitHub, Git, package manager, CI)
- The plan mentions an unfamiliar package, language, or framework
- The user explicitly asks for a research pass

Do **not** trigger on:
- Single-file edits and doc fixes
- Implementations of a previously-accepted plan
- PRs that only rename or reformat

## Procedure

1. Read the current session's plan from the parent context. Do **not** ask the user to re-state it.
2. Output a single Markdown block titled "Research checkpoint" containing:
   - The plan summary in <= 3 bullets
   - A **one-line** decision the research is meant to inform
   - A draft ChatGPT Deep Research prompt in a copyable ```text fenced block
3. Ask the user one question: "Run the research, or proceed without?"
4. If they run the research, wait for the result and continue. Persist a concise dated summary into the consumer project's `docs/research/` only if the research materially shapes an ADR or other architectural decision; otherwise treat the result as session-local.
5. If they decline, proceed with the plan as written. Do not mention the offer again this session.

## Constraints

- Never ask the user to formulate the prompt themselves. The draft is yours to write.
- Never loop. One offer, one outcome, continue.
- Never persist the full ChatGPT output. The summary you write must be yours, dated, and bounded.