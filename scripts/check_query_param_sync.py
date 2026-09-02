#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cross-language query parameter name consistency check.

Parses the pagination query parameter names from
`lib/src/server/server_constants.dart` (Dart) and the client-side URL
builder in `assets/web/utils.ts` (TypeScript), then asserts they match.

Catches the class of bug where the Dart server renames its query
parameters but the JS client keeps emitting the old names, causing
the server to ignore pagination silently (bug 080).

Usage:
    python scripts/check_query_param_sync.py

Exit code: 0 when in sync; 1 on mismatch or parse failure.
"""

import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent

DART_FILE = REPO_ROOT / "lib" / "src" / "server" / "server_constants.dart"
TS_FILE = REPO_ROOT / "assets" / "web" / "utils.ts"

# Dart: `static const String queryParamLimit = 'limit';`
DART_LIMIT = re.compile(
    r"static\s+const\s+String\s+queryParamLimit\s*=\s*'(\w+)'"
)
DART_OFFSET = re.compile(
    r"static\s+const\s+String\s+queryParamOffset\s*=\s*'(\w+)'"
)

# --- TypeScript URL builder param extraction ---
# We try several regex patterns in order so the check survives common
# refactors of buildTableDataUrl (template literals, double quotes,
# URLSearchParams, etc.).  Each pattern captures (limit_name, offset_name).
#
# Pattern 1 — string concatenation with single OR double quotes:
#   '?limit=' + limit + '&offset=' + offset
#   "?limit=" + limit + "&offset=" + offset
TS_CONCAT = re.compile(
    r"""\?(\w+)=['"]"""           # ?PARAM_NAME= followed by closing quote
    r"""\s*\+\s*\w+\s*\+\s*"""   # + value_expr +
    r"""['"]&(\w+)=['"]"""        # '&PARAM_NAME=' (or double-quoted)
    r"""\s*\+\s*\w+"""            # + value_expr
)

# Pattern 2 — ES6 template literal:
#   `...?limit=${limit}&offset=${offset}`
#   `...?limit=${someExpr}&offset=${someExpr}`
TS_TEMPLATE = re.compile(
    r"""\?(\w+)=\$\{[^}]+\}"""   # ?PARAM_NAME=${...}
    r"""&(\w+)=\$\{[^}]+\}"""    # &PARAM_NAME=${...}
)

# Pattern 3 — URLSearchParams object literal:
#   new URLSearchParams({ limit: val, offset: val })
# Captures the JS property names, which equal the query param names.
TS_URLSP = re.compile(
    r"""URLSearchParams\(\s*\{"""
    r"""\s*(\w+)\s*:"""           # first key (limit param name)
    r"""[^,}]+,"""                # value + comma
    r"""\s*(\w+)\s*:"""           # second key (offset param name)
)

# Ordered list: try each pattern until one matches.
TS_PARAM_PATTERNS = [TS_CONCAT, TS_TEMPLATE, TS_URLSP]


def main() -> int:
    errors: list[str] = []

    # Parse Dart constants.
    if not DART_FILE.is_file():
        print(f"ERROR: {DART_FILE} not found", file=sys.stderr)
        return 1
    dart_src = DART_FILE.read_text(encoding="utf-8")

    m_limit = DART_LIMIT.search(dart_src)
    m_offset = DART_OFFSET.search(dart_src)
    if not m_limit:
        errors.append(f"Could not parse queryParamLimit from {DART_FILE.name}")
    if not m_offset:
        errors.append(f"Could not parse queryParamOffset from {DART_FILE.name}")

    # Parse TypeScript URL builder.
    if not TS_FILE.is_file():
        print(f"ERROR: {TS_FILE} not found", file=sys.stderr)
        return 1
    ts_src = TS_FILE.read_text(encoding="utf-8")

    # Try each TS pattern in order — first match wins.  This lets the
    # check survive common refactors (template literals, URLSearchParams)
    # without a manual update to this script.
    m_ts = None
    for pattern in TS_PARAM_PATTERNS:
        m_ts = pattern.search(ts_src)
        if m_ts:
            break

    if not m_ts:
        errors.append(
            f"Could not parse query param names from buildTableDataUrl in "
            f"{TS_FILE.name} — none of {len(TS_PARAM_PATTERNS)} patterns matched. "
            f"If the URL builder was refactored, add a new pattern to "
            f"TS_PARAM_PATTERNS in {Path(__file__).name}"
        )

    if errors:
        for e in errors:
            print(f"PARSE ERROR: {e}", file=sys.stderr)
        return 1

    dart_limit = m_limit.group(1)  # type: ignore[union-attr]
    dart_offset = m_offset.group(1)  # type: ignore[union-attr]
    ts_limit = m_ts.group(1)  # type: ignore[union-attr]
    ts_offset = m_ts.group(2)  # type: ignore[union-attr]

    if dart_limit != ts_limit:
        errors.append(
            f"Limit param mismatch: Dart='{dart_limit}', TS='{ts_limit}'"
        )
    if dart_offset != ts_offset:
        errors.append(
            f"Offset param mismatch: Dart='{dart_offset}', TS='{ts_offset}'"
        )

    if errors:
        print("FAIL: query parameter names out of sync:")
        for e in errors:
            print(f"  {e}")
        return 1

    print(
        f"OK: query params in sync — "
        f"limit='{dart_limit}', offset='{dart_offset}' "
        f"(Dart <-> TypeScript)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
