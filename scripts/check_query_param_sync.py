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

# TypeScript: `?limit=' + limit + '&offset=' + offset`
# Matches the parameter names in the query string template.
TS_PARAMS = re.compile(r"\?(\w+)=' \+ limit \+ '&(\w+)=' \+ offset")


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

    m_ts = TS_PARAMS.search(ts_src)
    if not m_ts:
        errors.append(
            f"Could not parse query param names from buildTableDataUrl in {TS_FILE.name}"
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
