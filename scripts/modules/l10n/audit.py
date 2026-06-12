# -*- coding: utf-8 -*-
"""Runtime l10n audit — classify every locale bundle, never translate (plan 75 §4).

The source of truth is the extracted registries (symbolic key → English). For each
discovered locale, every source key is classified:

  - **missing** — no entry in the locale bundle (runtime falls back to English).
  - **untranslated** — value == English and NOT a forced-identity key (a real gap).
  - **identity** — value == English but correct (brand/acronym/symbol/cognate).
  - **brand_mangled** — value differs but dropped a brand token (rejected quality).
  - **translated** — value differs and clean; split by engine via provenance.

plus **orphan** keys (present in the bundle, gone from source). Coverage percent =
(total − missing − untranslated − brand_mangled) / total. The percent is a FLOOR,
not a guarantee: a legitimate cognate identical to English that is not yet in the
verified-identical list reads as untranslated. This module NEVER writes a bundle
and NEVER calls a translator.
"""

from pathlib import Path

from modules.l10n import bundles, extract
from modules.l10n.brands import validate_brands
from modules.l10n.provenance import (
    classify_translated_keys,
    is_forced_identity,
    quality_split,
)


def _translated_by_key(
    locale: str,
    source_host: dict[str, str],
    source_web: dict[str, str],
) -> tuple[dict[str, str], int]:
    """Adapt both per-surface locale bundles into one symbolic-key → value map.

    The host bundle is English-value-keyed, so each source key's value is looked up
    by its English text; the web bundle is already symbolic-key-keyed. Returns
    `(translated_by_key, orphan_count)`.
    """
    web = bundles.load_json(bundles.web_locale_bundle_path(locale))
    host = bundles.load_json(bundles.host_locale_bundle_path(locale))

    out: dict[str, str] = {}
    for key in source_web:
        if key in web:
            out[key] = web[key]
    for key, english in source_host.items():
        if english in host:
            out[key] = host[english]

    web_orphans = sum(1 for k in web if k not in source_web)
    host_values = set(source_host.values())
    host_orphans = sum(1 for v in host if v not in host_values)
    return out, web_orphans + host_orphans


def audit_locale(locale: str) -> dict[str, object]:
    """Classify one locale against the current source. Reads bundles, writes nothing."""
    source_host = extract.extract_host()
    source_web = extract.extract_web()
    source = {**source_host, **source_web}
    translated, orphans = _translated_by_key(locale, source_host, source_web)

    missing = untranslated = identity = brand_mangled = 0
    clean: dict[str, str] = {}  # symbolic key → English, for engine classification
    for key, english in source.items():
        if key not in translated:
            missing += 1
            continue
        value = translated[key]
        if value == english:
            if is_forced_identity(english, locale):
                identity += 1
            else:
                untranslated += 1
        elif validate_brands(english, value):
            brand_mangled += 1
        else:
            clean[key] = english

    engine_counts = classify_translated_keys(locale, clean)
    high, low = quality_split(engine_counts)
    total = len(source)
    covered = total - missing - untranslated - brand_mangled
    pct = round(covered / total * 100, 1) if total else 100.0

    return {
        "locale": locale,
        "total": total,
        "missing": missing,
        "untranslated": untranslated,
        "identity": identity,
        "brand_mangled": brand_mangled,
        "translated": len(clean),
        "orphans": orphans,
        "engine_counts": engine_counts,
        "high_quality": high,
        "low_quality": low,
        "coverage_pct": pct,
    }


def run_audit(locales: list[str] | None = None) -> dict[str, object]:
    """Audit the given locales (or every discovered one). Pure read; never translates.

    Returns `{source_keys, locales: [per-locale dict], english_only}`. With no
    locale bundles on disk (today's English-only state) `english_only` is True and
    `locales` is empty — there is nothing to translate.
    """
    source = extract.extract_all()
    targets = sorted(locales) if locales else sorted(bundles.discover_locales())
    return {
        "source_keys": len(source),
        "host_keys": len(extract.extract_host()),
        "web_keys": len(extract.extract_web()),
        "locales": [audit_locale(loc) for loc in targets],
        "english_only": not targets,
    }


def has_gaps(report: dict[str, object]) -> bool:
    """True if any audited locale has missing, untranslated, or brand-mangled keys."""
    for loc in report.get("locales", []):  # type: ignore[union-attr]
        if loc["missing"] or loc["untranslated"] or loc["brand_mangled"]:
            return True
    return False


def write_report(report: dict[str, object], reports_dir: Path, timestamp: str) -> Path:
    """Write the audit report JSON to `reports_dir`; returns the path.

    `timestamp` is supplied by the caller (the launcher stamps it) so this module
    stays free of wall-clock calls and is deterministic under test.
    """
    import json

    reports_dir.mkdir(parents=True, exist_ok=True)
    path = reports_dir / f"{timestamp}_l10n_runtime_audit.json"
    payload = {
        "note": (
            "Coverage percent is a FLOOR: a legitimate cognate identical to "
            "English (not yet in the verified-identical list) reads as "
            "untranslated. This audit never translates."
        ),
        **report,
    }
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return path
