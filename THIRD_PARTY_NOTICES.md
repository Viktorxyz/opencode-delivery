# Third-Party Notices

`opencode-ship@0.6.0` ships the profile-aware installer foundation
(`core` and `engineering` profiles) plus the durable plan artifact
and Plan Mode permission integration. The `core` profile ships
only opencode-ship-authored content (two delivery agents, two
workflow skills). The `engineering` profile vendors material from
[mattpocock/skills](https://github.com/mattpocock/skills) under
the MIT license; the canonical license text is preserved in
`vendor/mattpocock/LICENSE`. The current package version ships
placeholder SKILL.md content for `triage` and `grill-with-docs`; the
real upstream content is pending vendoring and will replace the
placeholders without changing the manifest or the engineering
profile's installed file set.

## Bundled skill content

| Profile | Local file | Upstream repo | License | Reuse mode |
|---|---|---|---|---|
| engineering | `assets/skills/triage/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |
| engineering | `assets/skills/grill-with-docs/SKILL.md` | `mattpocock/skills` | MIT (see `vendor/mattpocock/LICENSE`) | adapted |

The manifest at `vendor/sources.json` records the immutable
source reference, upstream path, local target, SHA-256, reuse
mode, license, and adaptation note for every vendored file.
