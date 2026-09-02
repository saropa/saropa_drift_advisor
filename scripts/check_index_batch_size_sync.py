#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Cross-language index batch-size consistency check.

Parses the server-side max-indexes-per-batch from
`lib/src/server/index_batch_handler.dart` (Dart) and the client-side
chunk size from `extension/src/health/index-apply.ts` (TypeScript),
then asserts that both values are equal.

If `IndexBatchHandler.maxIndexes` changes without a matching
`INDEX_APPLY_CHUNK_SIZE` update, this script fails — preventing a
mismatch where the client sends oversized batches that the server
rejects with "Too many statements".

Modeled on: scripts/check_longpoll_timeout_sync.py

Usage:
    python scripts/check_index_batch_size_sync.py

Exit code: 0 when in sync; 1 on mismatch or parse failure.
"""

import re
import sys
from pathlib import Path

# Repo root is one level up from this script's directory.
REPO_ROOT = Path(__file__).resolve().parent.parent

# Source file paths relative to the repo root.
DART_FILE = REPO_ROOT / "lib" / "src" / "server" / "index_batch_handler.dart"
TS_FILE = REPO_ROOT / "extension" / "src" / "health" / "index-apply.ts"

# Patterns to extract the numeric values.
# Dart: `static const int maxIndexes = 200;`
DART_PATTERN = re.compile(
    r"static\s+const\s+int\s+maxIndexes\s*=\s*(\d+)\s*;"
)
# TypeScript: `const INDEX_APPLY_CHUNK_SIZE = 200;`
TS_PATTERN = re.compile(
    r"const\s+INDEX_APPLY_CHUNK_SIZE\s*=\s*(\d+)\s*;"
)


def parse_dart_max(path: Path) -> int:
    """Extract IndexBatchHandler.maxIndexes from Dart source."""
    text = path.read_text(encoding="utf-8")
    match = DART_PATTERN.search(text)
    if not match:
        raise ValueError(
            f"Could not find maxIndexes in {path.relative_to(REPO_ROOT)}"
        )
    return int(match.group(1))


def parse_ts_chunk(path: Path) -> int:
    """Extract INDEX_APPLY_CHUNK_SIZE from TypeScript source."""
    text = path.read_text(encoding="utf-8")
    match = TS_PATTERN.search(text)
    if not match:
        raise ValueError(
            f"Could not find INDEX_APPLY_CHUNK_SIZE in {path.relative_to(REPO_ROOT)}"
        )
    return int(match.group(1))


def main() -> int:
    errors: list[str] = []

    try:
        dart_val = parse_dart_max(DART_FILE)
    except (FileNotFoundError, ValueError) as exc:
        errors.append(str(exc))
        dart_val = None

    try:
        ts_val = parse_ts_chunk(TS_FILE)
    except (FileNotFoundError, ValueError) as exc:
        errors.append(str(exc))
        ts_val = None

    if errors:
        for err in errors:
            print(f"ERROR: {err}", file=sys.stderr)
        return 1

    assert dart_val is not None and ts_val is not None

    print(f"Dart  IndexBatchHandler.maxIndexes = {dart_val}  ({DART_FILE.relative_to(REPO_ROOT)})")
    print(f"TS    INDEX_APPLY_CHUNK_SIZE        = {ts_val}  ({TS_FILE.relative_to(REPO_ROOT)})")

    if dart_val != ts_val:
        print(
            f"\nFAIL: Values differ — Dart has {dart_val}, "
            f"TypeScript has {ts_val}. Update one to match.",
            file=sys.stderr,
        )
        return 1

    print("\nOK: Index batch sizes are in sync.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
