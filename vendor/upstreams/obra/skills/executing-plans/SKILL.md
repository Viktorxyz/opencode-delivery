---
name: executing-plans
description: Execute an approved plan one task at a time, in the exact order Ship specifies.
---

# executing-plans

Each task is dispatched to the cheap builder child session
with the exact task brief. The task reviewer returns a Spec +
Quality verdict. The deterministic controller runs the
verification suite and either commits the reviewed paths or
returns the task to the builder with the verdict.

Three reviewed failures on the same task request a new
strong-model plan revision; no fourth dispatch exists.
