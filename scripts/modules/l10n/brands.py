# -*- coding: utf-8 -*-
"""Brand-name protection for runtime l10n (plan 75 §4).

Brand names must appear verbatim in every locale — never translated,
transliterated, or phonetically adapted. Machine translators routinely mangle
them ("Drift" → "Abdrift" in German, "ドリフト" in Japanese), so before any MT
pass brand tokens are swapped for `<B0>`/`<B1>` placeholders, translated, then
restored and validated; a translation that dropped a brand is rejected.

Three categories (mirrors the Saropa Contacts / Log Capture model):
  - BRAND_ONLY / pure-token strings — the whole string IS brand(s); the correct
    value equals English, so it is never sent to the translator and never counted
    as untranslated.
  - ACRONYM_ONLY — standalone technical initialisms, forced English everywhere.
  - VERIFIED_IDENTICAL — per-locale human-verified cognates whose correct value
    happens to equal English; audit-only, so a real gap stays visible.

BRAND_TOKENS are substrings that must survive verbatim inside longer translated
strings; ordered longest-first so multi-word brands shield as one token.
"""

import re

# Full strings that are brand-only but NOT composed purely of BRAND_TOKENS, so the
# token-derivation in is_brand_only() can't catch them alone. "Saropa Drift
# Advisor" qualifies because "Advisor" is not itself a token. Pure-token strings
# ("Drift", "SQLite", "Saropa Log Capture") do NOT need listing here.
BRAND_ONLY_STRINGS: frozenset[str] = frozenset({
    "Saropa Drift Advisor",
    "Drift Viewer",
})

# Standalone technical acronyms/initialisms — English in every locale (plan 75 §4).
# Exact-match only: an acronym inside a sentence ("Copy SQL") still translates
# normally; only the standalone label is forced English so it stays uniform.
ACRONYM_ONLY_STRINGS: frozenset[str] = frozenset({
    "SQL", "DB", "PII", "FK", "PK", "ER", "TTL", "LLM", "API", "URL",
    "OK", "ID", "NL", "DVR", "PRAGMA", "JSON", "CSV", "HTML", "UUID",
})

# Strings whose CORRECT translation in a SPECIFIC locale equals the English source
# — human-verified, so the audit stops counting them as untranslated. Per-locale
# (unlike brands/acronyms, which hold everywhere). Add an entry ONLY after
# confirming the word is genuinely identical in that locale; a wrong entry
# silences a real gap. Empty until a reviewer verifies cognates per locale.
VERIFIED_IDENTICAL: dict[str, frozenset[str]] = {}

# Substrings that must survive translation verbatim. Longest-first so
# "Saropa Drift Advisor" / "Saropa Log Capture" match before "Saropa".
BRAND_TOKENS: tuple[str, ...] = (
    "Saropa Drift Advisor",
    "Saropa Log Capture",
    "Drift Viewer",
    "VM Service",
    "Saropa",
    "Drift",
    "SQLite",
    "Flutter",
    "Isar",
    "Moor",
    "Dart",
    "GitHub",
    "Open VSX",
    # Technical identifiers that look like words but must stay literal.
    ".drift-rules.json",
    "driftViewer",
)


def is_brand_only(en_value: str) -> bool:
    """True if the ENTIRE string is brand name(s) and must never be translated.

    Either an explicit BRAND_ONLY_STRINGS entry, or a string that is nothing but
    brand tokens plus whitespace/punctuation once every token is shielded
    (e.g. "Drift", "SQLite", "Saropa Log Capture"). Without the second case a
    bare-brand string is sent to the translator and then counted as untranslated
    forever (value == English).
    """
    if en_value in BRAND_ONLY_STRINGS:
        return True
    shielded, replacements = shield_brands(en_value)
    if not replacements:
        return False
    for placeholder, _brand in replacements:
        shielded = shielded.replace(placeholder, "")
    return not any(ch.isalnum() for ch in shielded)


def is_acronym_only(en_value: str) -> bool:
    """True if the whole string is a technical acronym forced English everywhere.

    Exact-match only — an acronym inside a longer sentence is translated normally.
    """
    return en_value in ACRONYM_ONLY_STRINGS


def is_verified_identical(en_value: str, locale: str) -> bool:
    """True if a human verified English is the correct rendering in this locale."""
    return en_value in VERIFIED_IDENTICAL.get(locale, frozenset())


# Format placeholders ({0}, {1}, {count}) are substituted at runtime and are not
# translatable text. Drop them before deciding whether a real word remains.
_PLACEHOLDER_RE = re.compile(r"\{[^}]*\}")


def is_no_translatable_content(en_value: str) -> bool:
    """True if the string has no translatable word — only symbols, digits,
    punctuation, and {n} placeholders (e.g. "{0}/100", "{0} #").

    Identity IS the correct rendering: there is nothing to translate, so the value
    equals English in every locale. ASCII letters, or a run of 2+ Unicode letters
    (a non-Latin word), count as translatable; a lone letter-shaped symbol does not.
    """
    stripped = _PLACEHOLDER_RE.sub("", en_value)
    if any("a" <= ch.lower() <= "z" for ch in stripped):
        return False
    run = 0
    for ch in stripped:
        if ch.isalpha():
            run += 1
            if run >= 2:
                return False
        else:
            run = 0
    return True


def validate_brands(en_value: str, translated: str) -> list[str]:
    """Return brand tokens present in English but missing from the translation."""
    return [b for b in BRAND_TOKENS if b in en_value and b not in translated]


def shield_brands(text: str) -> tuple[str, list[tuple[str, str]]]:
    """Replace brand tokens with placeholders `<B0>`, `<B1>`, … (longest-first).

    Returns (shielded_text, [(placeholder, original), …]).
    """
    replacements: list[tuple[str, str]] = []
    idx = 0
    for brand in BRAND_TOKENS:
        if brand in text:
            placeholder = f"<B{idx}>"
            text = text.replace(brand, placeholder)
            replacements.append((placeholder, brand))
            idx += 1
    return text, replacements


def unshield_brands(text: str, replacements: list[tuple[str, str]]) -> str:
    """Restore brand tokens from placeholders, tolerating MT-added spaces/casing."""
    for placeholder, brand in replacements:
        if placeholder in text:
            text = text.replace(placeholder, brand)
            continue
        pattern = re.compile(
            re.escape(placeholder).replace(r"\<", r"<\s*").replace(r"\>", r"\s*>"),
            re.IGNORECASE,
        )
        text = pattern.sub(brand, text)
    return text
