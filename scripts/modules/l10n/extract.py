# -*- coding: utf-8 -*-
"""Extract the English source-of-truth from the TypeScript registries (plan 75 §3.1).

The runtime strings are declared once each as `Record<string, string>` literals in
`extension/src/l10n/strings-*.ts` (host) and `assets/web/l10n/strings-web*.ts`
(web). This module globs both trees and parses every `'symbolic.key': 'English'`
entry into a flat `{key: english}` map — the source every downstream step (audit,
sync, translate) reads. No TypeScript runtime is involved; a tolerant regex over
the object body is enough because the entries are plain string-to-string literals.

Keys are namespaced by surface (`panel.*`, `host.*`, `viewer.*`, `nl.*`, `msg.*`,
`masthead.*`) so the host and web maps never collide and can be merged when needed.
"""

import re
from pathlib import Path

_MODULE_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = _MODULE_DIR.parents[2]

HOST_REGISTRY_DIR = PROJECT_ROOT / "extension" / "src" / "l10n"
WEB_REGISTRY_DIR = PROJECT_ROOT / "assets" / "web" / "l10n"

# Host: strings-host.ts + strings-panel-*.ts (excludes nls-coverage-data.ts, which
# does not start with `strings-`). Web: strings-web.ts + strings-web-*.ts.
HOST_GLOB = "strings-*.ts"
WEB_GLOB = "strings-web*.ts"

# A registry entry: a quoted dotted key, a colon, then a single- or double-quoted
# JS string value (honoring `\'` / `\"` escapes, never crossing the closing quote).
_ENTRY_RE = re.compile(
    r"""(['"])(?P<key>[\w.\-]+)\1      # 'symbolic.key'
        \s*:\s*
        (?P<q>['"])(?P<val>(?:\\.|(?!(?P=q)).)*)(?P=q)   # 'English value'
    """,
    re.VERBOSE,
)

# Minimal JS string-literal unescape for the value text.
_UNESCAPE = {
    "\\n": "\n", "\\t": "\t", "\\r": "\r",
    "\\'": "'", '\\"': '"', "\\\\": "\\", "\\`": "`",
}
_UNICODE_RE = re.compile(r"\\u([0-9a-fA-F]{4})")


def _unescape(raw: str) -> str:
    """Decode the JS escapes that appear in registry values (quotes, `\\uXXXX`)."""
    out = _UNICODE_RE.sub(lambda m: chr(int(m.group(1), 16)), raw)
    for src, dst in _UNESCAPE.items():
        out = out.replace(src, dst)
    return out


def parse_registry_file(path: Path) -> dict[str, str]:
    """Parse one `strings-*.ts` file into `{symbolic_key: english}`.

    Parsing starts at the object literal (`= {`) so the module's doc-comment header
    — which may contain illustrative `'key': 'value'` snippets — is never scraped
    as real entries. Inline `// ---` group headers carry no quoted key:value pair,
    so they are ignored naturally.
    """
    text = path.read_text(encoding="utf-8")
    brace = text.find("= {")
    body = text[brace:] if brace != -1 else text
    out: dict[str, str] = {}
    for m in _ENTRY_RE.finditer(body):
        out[m.group("key")] = _unescape(m.group("val"))
    return out


def _extract_dir(directory: Path, glob: str) -> dict[str, str]:
    """Merge every registry file under `directory` matching `glob`."""
    merged: dict[str, str] = {}
    if not directory.exists():
        return merged
    for path in sorted(directory.glob(glob)):
        merged.update(parse_registry_file(path))
    return merged


def extract_host() -> dict[str, str]:
    """Host (System B) symbolic key → English, merged across `strings-*.ts`."""
    return _extract_dir(HOST_REGISTRY_DIR, HOST_GLOB)


def extract_web() -> dict[str, str]:
    """Web (System B) symbolic key → English, merged across `strings-web*.ts`."""
    return _extract_dir(WEB_REGISTRY_DIR, WEB_GLOB)


def extract_all() -> dict[str, str]:
    """Both surfaces merged. Keys are surface-namespaced, so no collision."""
    merged = extract_host()
    merged.update(extract_web())
    return merged
