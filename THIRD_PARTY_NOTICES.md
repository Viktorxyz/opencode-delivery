# Third-Party Notices

`opencode-ship@0.10.0` ships the complete Matt Pocock and Superpowers
methodology under the MIT license, plus the Ship-owned installer,
plugin, agents, and skills. The complete immutable pin list is in
`vendor/sources.json`; the upstream snapshots are under
`vendor/upstreams/<owner>/`. The canonical MIT text for each
upstream is preserved in `vendor/<owner>/LICENSE`.

The engineering profile is the consumer-installable bundle of
all 24 vendored skills (14 mattpocock + 10 obra/superpowers)
plus the Ship-owned delivery agents, plugin, and Plan Mode
permission block.

## Bundled skill content

| Profile | Local file | Upstream repo | License | Reuse mode |
|---|---|---|---|---|
| engineering | `assets/skills/setup-engineering-workflow/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/engineering-workflow/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/grilling/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/domain-modeling/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/grill-with-docs/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/triage/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/to-spec/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/to-tickets/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/wayfinder/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/handoff/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/research/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/prototype/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/codebase-design/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/code-review/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/brainstorming/SKILL.md` | `obra/superpowers` | MIT (see `vendor/superpowers/LICENSE`) | adapted |
| engineering | `assets/skills/writing-plans/SKILL.md` | `obra/superpowers` | MIT (see `vendor/superpowers/LICENSE`) | adapted |
| engineering | `assets/skills/executing-plans/SKILL.md` | `obra/superpowers` | MIT (see `vendor/superpowers/LICENSE`) | adapted |
| engineering | `assets/skills/subagent-driven-development/SKILL.md` | `obra/superpowers` | MIT (see `vendor/superpowers/LICENSE`) | adapted |
| engineering | `assets/skills/dispatching-parallel-agents/SKILL.md` | `obra/superpowers` | MIT (see `vendor/superpowers/LICENSE`) | adapted |
| engineering | `assets/skills/test-driven-development/SKILL.md` | `obra/superpowers` | MIT (see `vendor/superpowers/LICENSE`) | adapted |
| engineering | `assets/skills/systematic-debugging/SKILL.md` | `obra/superpowers` | MIT (see `vendor/superpowers/LICENSE`) | adapted |
| engineering | `assets/skills/verification-before-completion/SKILL.md` | `obra/superpowers` | MIT (see `vendor/superpowers/LICENSE`) | adapted |
| engineering | `assets/skills/requesting-code-review/SKILL.md` | `obra/superpowers` | MIT (see `vendor/superpowers/LICENSE`) | adapted |
| engineering | `assets/skills/receiving-code-review/SKILL.md` | `obra/superpowers` | MIT (see `vendor/superpowers/LICENSE`) | adapted |

## Pin summary

- `mattpocock/skills` pinned to commit `2ab958093e83e0ec752e6c1c5932da465bf23e0c`
- `obra/superpowers` pinned to commit `44c9b2d6e889982ac18c27d05a19fefe335194e1`

The manifest at `vendor/sources.json` records the immutable
source reference, upstream path, local target, SHA-256, reuse
mode, license, and adaptation note for every vendored file.
The `tests/package/vendor-closure.test.mjs` suite fails closed
when the manifest is malformed, when the upstream snapshot is
missing, when the local file is missing, or when the local file
hash drifts from the recorded `sourceSha256`.
