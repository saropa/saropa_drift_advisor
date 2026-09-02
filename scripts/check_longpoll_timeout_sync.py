#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cross-language long-poll timeout consistency check.

Parses the server-side long-poll timeout from
`lib/src/server/server_constants.dart` (Dart) and the client-side
timeout from `extension/src/transport/fetch-utils.ts` (TypeScript),
then asserts that the client timeout exceeds the server timeout by at
least a configurable margin.

If the Dart constant changes without a matching TypeScript update, this
script fails — preventing a repeat of the bug where `httpGeneration`
inherited an 8 s default against a 30 s server window, driving
`GenerationWatcher` into exponential backoff on every idle database.

See: plans/history/2026.09/20260902/infra_generation_longpoll_timeout_shorter_than_server.md

Usage:
    python scripts/check_longpoll_timeout_sync.py [--min-margin-ms N]
    python scripts/check_longpoll_timeout_sync.py  # default 1000 ms margin

Exit code: 0 when in sync; 1 on mismatch or parse failure.
"""

import argparse
import re
import sys
from pathlib import Path

# Repo root is one level up from this script's directory.
REPO_ROOT = Path(__file__).resolve().parent.parent

# Source file paths relative to the repo root.
DART_FILE = REPO_ROOT / "lib" / "src" / "server" / "server_constants.dart"
TS_FILE = REPO_ROOT / "extension" / "src" / "transport" / "fetch-utils.ts"

# Patterns to extract the numeric values.
# Dart: `static const Duration longPollTimeout = Duration(seconds: 30);`
DART_PATTERN = re.compile(
    r"static\s+const\s+Duration\s+longPollTimeout\s*=\s*Duration\(\s*seconds:\s*(\d+)\s*\)"
)
# TypeScript: `export const LONG_POLL_TIMEOUT_MS = 31000;`
TS_PATTERN = re.compile(
    r"export\s+const\s+LONG_POLL_TIMEOUT_MS\s*=\s*(\d+)\s*;"
)


def parse_dart_timeout_ms(path: Path) -> int:
    """Extract the server long-poll timeout in milliseconds from Dart source."""
    text = path.read_text(encoding="utf-8")
    match = DART_PATTERN.search(text)
    if not match:
        raise ValueError(
            f"Could not find longPollTimeout in {path.relative_to(REPO_ROOT)}"
        )
    # Convert seconds to milliseconds.
    return int(match.group(1)) * 1000


def parse_ts_timeout_ms(path: Path) -> int:
    """Extract LONG_POLL_TIMEOUT_MS from TypeScript source."""
    text = path.read_text(encoding="utf-8")
    match = TS_PATTERN.search(text)
    if not match:
        raise ValueError(
            f"Could not find LONG_POLL_TIMEOUT_MS in {path.relative_to(REPO_ROOT)}"
        )
    return int(match.group(1))


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Assert client long-poll timeout exceeds server timeout."
    )
    parser.add_argument(
        "--min-margin-ms",
        type=int,
        default=1000,
        help="Minimum required margin in ms (default: 1000).",
    )
    args = parser.parse_args()

    errors: list[str] = []

    # Parse both constants.
    try:
        dart_ms = parse_dart_timeout_ms(DART_FILE)
    except (FileNotFoundError, ValueError) as exc:
        errors.append(str(exc))
        dart_ms = None

    try:
        ts_ms = parse_ts_timeout_ms(TS_FILE)
    except (FileNotFoundError, ValueError) as exc:
        errors.append(str(exc))
        ts_ms = None

    if errors:
        for err in errors:
            print(f"ERROR: {err}", file=sys.stderr)
        return 1

    # Both parsed successfully — check the relationship.
    assert dart_ms is not None and ts_ms is not None
    margin = ts_ms - dart_ms
    min_margin = args.min_margin_ms

    print(f"Dart  longPollTimeout       = {dart_ms} ms  ({DART_FILE.relative_to(REPO_ROOT)})")
    print(f"TS    LONG_POLL_TIMEOUT_MS   = {ts_ms} ms  ({TS_FILE.relative_to(REPO_ROOT)})")
    print(f"Margin                       = {margin} ms  (minimum: {min_margin} ms)")

    if ts_ms <= dart_ms:
        print(
            f"\nFAIL: Client timeout ({ts_ms} ms) must be GREATER than "
            f"server timeout ({dart_ms} ms).",
            file=sys.stderr,
        )
        return 1

    if margin < min_margin:
        print(
            f"\nFAIL: Margin ({margin} ms) is below the minimum "
            f"({min_margin} ms).",
            file=sys.stderr,
        )
        return 1

    print("\nOK: Long-poll timeouts are in sync.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
