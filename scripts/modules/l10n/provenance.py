# -*- coding: utf-8 -*-
"""Per-key translation provenance: which engine produced each locale string.

Each locale gets a sidecar `l10n/provenance/<locale>.json` mapping
`symbolic_key -> engine` ("qwen_2.5_7b_local", "nllb", "google", "manual", …).
The bundles themselves stay plain value maps; provenance lives beside them (kept
out of the bundle glob) so the audit can report quality and an upgrade pass can
target only the weak ones.

Quality model (best → worst):
  HIGH   — qwen / manual / gemini / translation-memory / identity: never upgraded.
  MEDIUM — nllb: acceptable but worth upgrading to Qwen when possible.
  LOW    — google / mymemory / libretranslate / lingva / argos / legacy: upgrade.
  UNTRACKED — no provenance record at all: treated as low quality.

`is_low_quality(engine)` returns True for MEDIUM, LOW, and UNTRACKED — all are
upgrade candidates. The "upgrade low-quality" pass sweeps them into Qwen.
"""

import json
from pathlib import Path

from modules.l10n.brands import (
    is_acronym_only,
    is_brand_only,
    is_no_translatable_content,
    is_verified_identical,
)

_MODULE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = _MODULE_DIR.parents[2]
PROVENANCE_DIR = PROJECT_ROOT / "l10n" / "provenance"

ENGINE_QWEN = "qwen_2.5_7b_local"
ENGINE_NLLB = "nllb"
ENGINE_GOOGLE = "google"
ENGINE_MANUAL = "manual"
# Synthetic engine for a translated key with no provenance record. Never stored;
# inferred at classification time by absence. Always low quality.
ENGINE_UNTRACKED = "untracked"
# Synthetic engine for brand / acronym / symbol / verified-cognate keys whose
# correct value IS the English text. Inferred at classification time, never stored.
ENGINE_IDENTITY = "identity"

# High quality — never an upgrade candidate.
HIGH_QUALITY_ENGINES = frozenset({
    ENGINE_QWEN, ENGINE_MANUAL, ENGINE_IDENTITY, "translation_memory", "gemini",
})
# Medium quality — acceptable but worth upgrading to Qwen. NLLB output is
# functional but Qwen produces materially better translations; existing NLLB
# provenance keys are upgrade candidates alongside the low-quality engines.
MEDIUM_QUALITY_ENGINES = frozenset({
    ENGINE_NLLB,
})
# Low quality — produced by a weaker MT engine. Upgrade candidates.
LOW_QUALITY_ENGINES = frozenset({
    ENGINE_GOOGLE, "mymemory", "libretranslate", "lingva", "argos",
    "legacy_pre_provenance",
})

# Left-to-right order for the audit table: best quality first.
ENGINE_DISPLAY_ORDER = [
    ENGINE_QWEN, "gemini", ENGINE_MANUAL, "translation_memory", ENGINE_IDENTITY,
    ENGINE_NLLB,
    ENGINE_GOOGLE, "mymemory", "libretranslate", "lingva", "argos",
    "legacy_pre_provenance", ENGINE_UNTRACKED,
]


def is_low_quality(engine: str | None) -> bool:
    """True if an engine's output should be upgraded.

    Untracked (None / the untracked sentinel) and any explicitly low or unknown
    engine count as low — better to re-translate an unknown than to silently
    trust it. High-quality and identity engines do not.
    """
    if engine is None or engine == ENGINE_UNTRACKED:
        return True
    if engine in HIGH_QUALITY_ENGINES:
        return False
    return True


def is_forced_identity(key_english: str, locale: str) -> bool:
    """True if the correct value for this English source IS the English text.

    Brand-only, acronym-only, symbol-only, and per-locale human-verified cognates.
    Never translated, never an upgrade candidate. Takes the ENGLISH source value
    (the brand checks operate on text, not symbolic keys).
    """
    return (
        is_brand_only(key_english)
        or is_acronym_only(key_english)
        or is_no_translatable_content(key_english)
        or is_verified_identical(key_english, locale)
    )


def _provenance_path(locale: str) -> Path:
    """Sidecar path for a locale's provenance, kept out of the bundle glob."""
    return PROVENANCE_DIR / f"{locale}.json"


def load_provenance(locale: str) -> dict[str, str]:
    """Load `{symbolic_key: engine}` for a locale; {} if absent or unreadable."""
    path = _provenance_path(locale)
    if not path.exists():
        return {}
    try:
        raw = path.read_text(encoding="utf-8")
        return json.loads(raw) if raw.strip() else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_provenance(locale: str, updates: dict[str, str]) -> None:
    """Merge `updates` into the locale's provenance and write atomically.

    No-op when empty. Existing records are kept; only `updates` keys are
    overwritten, so a partial run records what it produced without clobbering
    untouched keys. Sorted keys keep the diff stable.
    """
    if not updates:
        return
    data = load_provenance(locale)
    data.update(updates)
    PROVENANCE_DIR.mkdir(parents=True, exist_ok=True)
    path = _provenance_path(locale)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(
        json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)


def classify_translated_keys(
    locale: str,
    translated: dict[str, str],
) -> dict[str, int]:
    """Bucket a locale's translated keys by engine. No record → `untracked`.

    `translated` maps symbolic key → its ENGLISH source (used for the
    forced-identity check). Forced-identity keys classify as `identity` regardless
    of any stored value, so brand/acronym/symbol strings never inflate the
    low-quality count.
    """
    provenance = load_provenance(locale)
    counts: dict[str, int] = {}
    for key, english in translated.items():
        if is_forced_identity(english, locale):
            engine = ENGINE_IDENTITY
        else:
            engine = provenance.get(key, ENGINE_UNTRACKED)
        counts[engine] = counts.get(engine, 0) + 1
    return counts


def quality_split(engine_counts: dict[str, int]) -> tuple[int, int]:
    """Return `(high_quality_total, low_quality_total)` from an engine→count map."""
    high = sum(n for eng, n in engine_counts.items() if not is_low_quality(eng))
    low = sum(n for eng, n in engine_counts.items() if is_low_quality(eng))
    return high, low
