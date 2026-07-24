# l10n identity key persistence fix

The runtime l10n translate-gaps pass (`translate_l10n.py`, option 3) completed
without error but produced no lasting coverage improvement. Re-running the audit
after a translate pass showed identical `missing` and `untranslated` counts.

## Root cause

Three independent classification gaps in the identity-detection pipeline:

1. **Forced-identity keys never written to bundles.** The translate action
   filtered out forced-identity keys (brands, acronyms, symbol-only strings)
   before the translate loop, correctly skipping MT for them — but nothing else
   wrote their English value to the locale bundles either. Result: 25 keys
   permanently counted as "missing" across all 10 locales.

2. **Missing acronyms.** `NULL`, `PNG`, `SVG` were absent from
   `ACRONYM_ONLY_STRINGS`. Qwen returned them unchanged; the audit classified
   the result as `untranslated` (value == English), creating an infinite cycle.

3. **Acronym-only residue in mixed strings.** Strings like `✓ FK {0} → {1}`
   contain no translatable content after stripping placeholders and the known
   acronym `FK`, but `is_no_translatable_content` did not strip acronyms before
   its ASCII-letter check. These also cycled through translate→audit→translate
   indefinitely.

A secondary gap: several per-locale cognates (`Schema` in Italian, `Status` /
`Total` / `Regex` in Portuguese, `ms` in Korean) had no entry in
`VERIFIED_IDENTICAL`, so they were flagged as untranslated despite being correct.

## Changes

- **`scripts/modules/l10n/brands.py`**: Added `NULL`, `PNG`, `SVG` to
  `ACRONYM_ONLY_STRINGS`. Populated `VERIFIED_IDENTICAL` with confirmed
  per-locale cognates. Enhanced `is_no_translatable_content` to strip known
  acronyms (longest-first) before the ASCII-letter check.

- **`scripts/modules/l10n/actions.py`**: Added a pre-loop block in
  `run_translate_action` that writes forced-identity missing keys to both web
  and host locale bundles with their English value, then persists atomically.
  Emits a dim diagnostic line per locale when identity keys are written.

- **`scripts/tests/test_l10n_toolchain.py`**: Added three test methods covering
  the new acronym entries, the acronym-stripping behavior in
  `is_no_translatable_content`, and `VERIFIED_IDENTICAL` lookups.

## Verification

- All 10 locales show 0 untranslated after the fix (verified via Python script
  against live source registries and locale bundles).
- All 9 audit tests pass; all 7 brand tests pass (including 3 new).
- Three pre-existing test failures in `TestProvenance` (NLLB quality
  classification) are unrelated and predate this change.
