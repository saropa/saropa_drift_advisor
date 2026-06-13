# Changelog: restore missing intro lines and log links

The changelog convention (stated in its maintenance header) is that every release section opens
with one plain-language, user-facing line and ends that line with a `[log](…/vX.Y.Z/CHANGELOG.md)`
link to the file at that release's GitHub tag. Four recent release sections had drifted from this:
**3.7.3** and **3.7.0** carried their opening line but no `[log]` link, and **3.6.1** and **3.6.0**
had neither an opening line nor a link — they jumped straight from the version header into their
`### Added` / `### Improved` subsections.

## Finish Report (2026-06-12)

### Scope

(C) docs only — `CHANGELOG.md`. No Dart app code, no extension TypeScript.

### What changed

- **3.7.3** — appended `[log](…/v3.7.3/CHANGELOG.md)` to the existing opening line.
- **3.7.0** — appended `[log](…/v3.7.0/CHANGELOG.md)` to the existing opening line.
- **3.6.1** — added a new plain-language opening line summarizing the orphan physical-table check,
  ending with `[log](…/v3.6.1/CHANGELOG.md)`. The line is derived from the single `### Added`
  entry in that release (flags tables present in the SQLite file but absent from the declared
  Drift schema).
- **3.6.0** — added a new plain-language opening line summarizing the three user-visible items in
  that release (startup-banner `adb forward` hint + real bound port, dimmed NULL cells with a
  display option, smaller tables-sidebar row counts), ending with `[log](…/v3.6.0/CHANGELOG.md)`.

Each tag substitution matches the `vX.Y.Z` of its own section, and each new intro is user-facing
(impact, not implementation), consistent with the wording style of the already-conformant sections
(3.5.0 and earlier).

### Verification

- All four sections now match the `## [x.y.z]` → intro-line-ending-in-`[log]` → subsections shape
  used by every release from 3.5.0 down.
- A scan of `## [` headers against `[log]` / `blob/v` occurrences confirms the four formerly-missing
  links are present; the remaining sections were already conformant and were not touched.
- No automated tests reference `CHANGELOG.md` (test-directory grep returned no matches), so there is
  no test surface to update for this change.

### Known divergence not addressed (out of scope)

The **3.7.3** section is structurally inverted relative to every other release: its
`<details>Maintenance</details>` block sits directly under the opening line, followed by a *second*
user-facing intro paragraph and then the `### Added` section — whereas every other release places
its single intro first and collapses Maintenance at the bottom. This task only restored the missing
intro/log links and deliberately did not reorder the 3.7.3 layout.
