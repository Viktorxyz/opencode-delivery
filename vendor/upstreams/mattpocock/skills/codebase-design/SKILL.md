---
name: codebase-design
description: Produce a codebase-level design document when the change spans multiple modules or packages.
---

# codebase-design

Inputs: spec, domain model, research digest, wayfinder map.
Output: a single design doc that names the modules to add or
modify, the public APIs they expose, the contracts between them,
and the migration plan for any existing call site.

The design doc is published through Ship's plan-mirror issue
comments. The vertical tickets reference sections of the design
doc; they never restate the design.
