#!/usr/bin/env python3
"""Gate 7: ICON_STATE_KEY parity between toolbar.ts and html_content.dart.

The icon font fallback (bug 081) persists its verdict to localStorage under a
key that appears in two files with no shared module:
  - assets/web/toolbar.ts  (ICON_STATE_KEY constant — the write side)
  - lib/src/server/html_content.dart  (inline <head> script — the read side)

If either side renames the key without updating the other, the first-paint seed
silently breaks: a known-iconless machine shows 3 seconds of blank glyph slots
on every repeat visit instead of immediate text labels.

Exit 0 = keys match.  Exit 1 = mismatch or missing.
"""

import re
import sys
from pathlib import Path

# Resolve repo root relative to this script's location (scripts/ is one level down).
REPO = Path(__file__).resolve().parent.parent

TS_PATH = REPO / "assets" / "web" / "toolbar.ts"
DART_PATH = REPO / "lib" / "src" / "server" / "html_content.dart"

# Pattern for the TS constant: export var ICON_STATE_KEY = 'some-key';
# Handles both single and double quotes.
TS_PATTERN = re.compile(
    r"""(?:export\s+)?var\s+ICON_STATE_KEY\s*=\s*['"]([^'"]+)['"]"""
)

# Pattern for the Dart inline script: localStorage.getItem('some-key')
DART_PATTERN = re.compile(
    r"""localStorage\.getItem\(['"]([^'"]+)['"]\)"""
)


def main() -> int:
    errors = []

    # Extract key from toolbar.ts.
    if not TS_PATH.exists():
        errors.append(f"toolbar.ts not found at {TS_PATH}")
    else:
        ts_source = TS_PATH.read_text(encoding="utf-8")
        ts_match = TS_PATTERN.search(ts_source)
        if not ts_match:
            errors.append(
                "ICON_STATE_KEY constant not found in toolbar.ts — "
                "expected `export var ICON_STATE_KEY = '...'`"
            )

    # Extract key from html_content.dart.
    if not DART_PATH.exists():
        errors.append(f"html_content.dart not found at {DART_PATH}")
    else:
        dart_source = DART_PATH.read_text(encoding="utf-8")
        dart_match = DART_PATTERN.search(dart_source)
        if not dart_match:
            errors.append(
                "localStorage.getItem('...') not found in html_content.dart — "
                "the inline <head> seed script is missing or malformed"
            )

    if errors:
        for e in errors:
            print(f"FAIL: {e}", file=sys.stderr)
        return 1

    ts_key = ts_match.group(1)
    dart_key = dart_match.group(1)

    if ts_key != dart_key:
        print(
            f"FAIL: ICON_STATE_KEY mismatch\n"
            f"  toolbar.ts:         '{ts_key}'\n"
            f"  html_content.dart:  '{dart_key}'\n"
            f"The two must be identical — the inline <head> script reads the "
            f"key that toolbar.ts writes.",
            file=sys.stderr,
        )
        return 1

    print(f"OK: ICON_STATE_KEY = '{ts_key}' (both files match)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
