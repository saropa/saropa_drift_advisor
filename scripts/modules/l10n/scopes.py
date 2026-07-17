# -*- coding: utf-8 -*-
"""Translation scopes — which keys a run touches (plan 75 §4 "Scopes").

| Scope        | Touches                                              | Used by |
|--------------|------------------------------------------------------|---------|
| `missing`    | only keys absent from the locale bundle              | publish (never re-sends en-copies) |
| `gaps`       | absent keys AND en-copies (value == English)         | the deliberate translate run |
| `low_quality`| existing translations with weak/untracked/NLLB provenance | the low/NLLB → Qwen upgrade pass |

All scopes operate on the SYMBOLIC-KEY space: `source` maps key → English, and
`translated` maps key → its current locale value (the caller adapts the host's
English-value-keyed bundle into key-keyed form first). Forced-identity keys
(brands/acronyms/symbols/verified cognates) are never selected by `gaps` or
`low_quality` — their correct value IS English, so an en-copy there is not a gap.
"""

from modules.l10n.provenance import is_forced_identity, is_low_quality

SCOPE_MISSING = "missing"
SCOPE_GAPS = "gaps"
SCOPE_LOW_QUALITY = "low_quality"
ALL_SCOPES = (SCOPE_MISSING, SCOPE_GAPS, SCOPE_LOW_QUALITY)


def select_keys(
    scope: str,
    source: dict[str, str],
    translated: dict[str, str],
    locale: str,
    provenance: dict[str, str] | None = None,
) -> set[str]:
    """Return the symbolic keys a run of `scope` should process for `locale`.

    - `missing`: source keys with no entry in `translated`.
    - `gaps`: missing keys plus translatable en-copies (value == English and not
      forced-identity).
    - `low_quality`: translated, non-identity keys whose provenance is weak or
      untracked — the upgrade-candidate set.
    """
    provenance = provenance or {}
    missing = {k for k in source if k not in translated}
    if scope == SCOPE_MISSING:
        return missing
    if scope == SCOPE_GAPS:
        en_copies = {
            k for k, english in source.items()
            if k in translated
            and translated[k] == english
            and not is_forced_identity(english, locale)
        }
        return missing | en_copies
    if scope == SCOPE_LOW_QUALITY:
        return {
            k for k, english in source.items()
            if k in translated
            and not is_forced_identity(english, locale)
            and is_low_quality(provenance.get(k))
        }
    raise ValueError(f"unknown scope: {scope!r} (expected one of {ALL_SCOPES})")
