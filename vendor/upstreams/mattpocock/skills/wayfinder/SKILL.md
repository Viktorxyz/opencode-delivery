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
