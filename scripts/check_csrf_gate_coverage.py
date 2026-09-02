#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CSRF gate coverage check for POST routes in router.dart.

Scans `lib/src/server/router.dart` for POST method checks and verifies
that each one has a `_rejectNonJsonBody` call within a short window
before the handler invocation. Catches the class of bug where a new
POST endpoint is added without the content-type gate, leaving it
cross-site forgeable (bug 003).

Usage:
    python scripts/check_csrf_gate_coverage.py

Exit code: 0 when every POST route is gated; 1 on any gap or parse failure.
"""

import re
import sys
from pathlib import Path

# Repo root is one level up from this script's directory.
REPO_ROOT = Path(__file__).resolve().parent.parent
ROUTER_FILE = REPO_ROOT / "lib" / "src" / "server" / "router.dart"

# How many lines around a POST check to look for the CSRF gate call.
LOOKAHEAD_LINES = 8

# Pattern matching a POST method check in the router.
POST_CHECK = re.compile(
    r"request\.method\s*==\s*ServerConstants\.methodPost"
)

# Pattern matching the CSRF gate call.
CSRF_GATE = re.compile(r"_rejectNonJsonBody\s*\(")

# Routes exempted by a nearby comment containing this marker. To exempt a
# route, add a comment on the same line or within LOOKAHEAD_LINES that
# contains "csrf-exempt:" followed by a reason. Pattern-based so line
# renumbering from refactors does not break the exemption list.
EXEMPT_MARKER = re.compile(r"csrf-exempt:\s*(.+)", re.IGNORECASE)


def main() -> int:
    if not ROUTER_FILE.is_file():
        print(f"ERROR: {ROUTER_FILE} not found", file=sys.stderr)
        return 1

    lines = ROUTER_FILE.read_text(encoding="utf-8").splitlines()
    gaps: list[tuple[int, str]] = []
    exempted = 0

    for i, line in enumerate(lines):
        if not POST_CHECK.search(line):
            continue

        line_num = i + 1  # 1-indexed

        # Look backward and forward within the window.
        window_start = max(0, i - LOOKAHEAD_LINES)
        window_end = min(len(lines), i + LOOKAHEAD_LINES + 1)
        window = "\n".join(lines[window_start:window_end])

        # Check for the CSRF gate within the window.
        if CSRF_GATE.search(window):
            continue

        # Check for an exemption marker within the window.
        if EXEMPT_MARKER.search(window):
            exempted += 1
            continue

        gaps.append((line_num, line.strip()))

    if gaps:
        print(f"FAIL: {len(gaps)} POST route(s) missing _rejectNonJsonBody gate:")
        for line_num, text in gaps:
            print(f"  line {line_num}: {text}")
        print(
            "\nTo exempt a route, add a comment within "
            f"{LOOKAHEAD_LINES} lines containing:\n"
            "  // csrf-exempt: <reason>"
        )
        return 1

    # Count total POST routes for the summary.
    total = sum(1 for line in lines if POST_CHECK.search(line))
    gated = total - exempted
    print(
        f"OK: {gated} POST route(s) gated, {exempted} exempted, "
        f"{total} total in {ROUTER_FILE.name}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
