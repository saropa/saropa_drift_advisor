# -*- coding: utf-8 -*-
"""Read/write the two runtime bundle formats + locale discovery (plan 75 §3.2).

Two consumers draw from the same English source but read different generated files:

  - **Host / panels:** `l10n/bundle.l10n.json` (English baseline) +
    `l10n/bundle.l10n.<locale>.json`, keyed by the **English string value**
    (`{"Toggle search": "搜索切换"}`) because host code resolves through
    `vscode.l10n.t(englishValue)`.
  - **Browser viewer:** `assets/web/l10n/web.<locale>.json`, keyed by the
    **symbolic key** (`{"viewer.toolbar.search.label": "搜索切换"}`) — the browser
    has no English-value-keyed l10n runtime, so symbolic keys are simpler and
    avoid shipping the English text twice (it is already in `bundle.js`).

English is the source: the host base bundle is identity (English→English) and the
browser ships no `web.en.json` (English lives in the bundled registries). All
writes are atomic (temp file + replace) so a CTRL-C mid-write never truncates a
bundle. Provenance sidecars live under `l10n/provenance/` — out of the bundle glob.
"""

import json
from pathlib import Path

_MODULE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = _MODULE_DIR.parents[2]

HOST_L10N_DIR = PROJECT_ROOT / "l10n"
WEB_L10N_DIR = PROJECT_ROOT / "assets" / "web" / "l10n"

# Discovers `bundle.l10n.<locale>.json` while EXCLUDING the base `bundle.l10n.json`
# (which has no locale segment). The character class forbids a dot in the locale
# so the base file's name can never be read as a locale.
_HOST_LOCALE_STEM = "bundle.l10n."
_WEB_LOCALE_PREFIX = "web."


def host_base_bundle_path() -> Path:
    """`l10n/bundle.l10n.json` — the English identity baseline (vscode-l10n source)."""
    return HOST_L10N_DIR / "bundle.l10n.json"


def host_locale_bundle_path(locale: str) -> Path:
    """`l10n/bundle.l10n.<locale>.json` — host translations for one locale."""
    return HOST_L10N_DIR / f"bundle.l10n.{locale}.json"


def web_locale_bundle_path(locale: str) -> Path:
    """`assets/web/l10n/web.<locale>.json` — browser translations for one locale."""
    return WEB_L10N_DIR / f"web.{locale}.json"


def discover_host_locales() -> set[str]:
    """Locale tags with a host bundle on disk (base `bundle.l10n.json` excluded)."""
    out: set[str] = set()
    if not HOST_L10N_DIR.exists():
        return out
    for path in HOST_L10N_DIR.glob("bundle.l10n.*.json"):
        # name == "bundle.l10n.<locale>.json" → strip prefix + ".json"
        locale = path.name[len(_HOST_LOCALE_STEM):-len(".json")]
        if locale:  # guards against an unexpected "bundle.l10n..json"
            out.add(locale)
    return out


def discover_web_locales() -> set[str]:
    """Locale tags with a browser bundle on disk (`web.<locale>.json`)."""
    out: set[str] = set()
    if not WEB_L10N_DIR.exists():
        return out
    for path in WEB_L10N_DIR.glob("web.*.json"):
        locale = path.name[len(_WEB_LOCALE_PREFIX):-len(".json")]
        if locale:
            out.add(locale)
    return out


def discover_locales() -> set[str]:
    """Union of host + web locale tags found on disk."""
    return discover_host_locales() | discover_web_locales()


def load_json(path: Path) -> dict[str, str]:
    """Load a `{key: value}` bundle; {} when absent, empty, or unparseable."""
    if not path.exists():
        return {}
    try:
        raw = path.read_text(encoding="utf-8")
        return json.loads(raw) if raw.strip() else {}
    except (OSError, json.JSONDecodeError):
        return {}


def write_json_atomic(path: Path, data: dict[str, str]) -> None:
    """Write `data` as sorted UTF-8 JSON via temp-file + replace (never truncates)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(
        json.dumps(data, indent=2, ensure_ascii=False, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    tmp.replace(path)
