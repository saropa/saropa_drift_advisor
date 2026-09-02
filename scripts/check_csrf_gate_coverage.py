#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CSRF gate coverage check for POST routes in router.dart.

Scans `lib/src/server/router.dart` for POST method checks and verifies
that each one has a `_rejectNonJsonBody` call within a short window
before the handler invocation. Catches the class of bug where a new
POST endpoint is added without the content-type gate, leaving it
cross-site forgeable (bug 003).

A secondary "drift detector" catches refactors that introduce POST
route patterns the primary regex does not recognise (variable aliasing,
string literals, route-table maps). If the Dart code changes shape but
this script stays the same, the drift detector fails the build instead
of silently passing with zero hits.

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

# ---------------------------------------------------------------------------
# Primary POST-detection regex: the canonical form used in router.dart today.
# ---------------------------------------------------------------------------
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

# ---------------------------------------------------------------------------
# Drift-detection regexes: alternate ways someone might check for POST that
# the primary regex would NOT match. Each pattern is paired with a human-
# readable description used in the warning message.
# ---------------------------------------------------------------------------
_DRIFT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # String literal 'POST' or "POST" used instead of the ServerConstants
    # constant — catches both single and double quotes.
    (
        re.compile(r"""['"]POST['"]"""),
        "string literal 'POST' (use ServerConstants.methodPost)",
    ),
    # Variable alias: someone stored request.method in a local and then
    # compared it to the constant — the primary regex misses the comparison
    # because it no longer says "request.method".
    (
        re.compile(
            r"==\s*ServerConstants\.methodPost"
            r"|"
            r"ServerConstants\.methodPost\s*=="
        ),
        "methodPost comparison without request.method prefix",
    ),
]


def _check_drift(lines: list[str]) -> list[tuple[int, str, str]]:
    """Return lines that match a drift pattern but NOT the primary regex.

    Each result is (1-indexed line number, stripped line text, drift reason).
    This catches refactors that silently escape the primary detector.
    """
    hits: list[tuple[int, str, str]] = []
    for i, line in enumerate(lines):
        # Skip lines inside block comments or single-line comments — drift
        # patterns inside comments are documentation, not route declarations.
        stripped = line.lstrip()
        if stripped.startswith("//") or stripped.startswith("*"):
            continue

        # If the primary regex already matches this line, the main loop
        # handles it — no drift here.
        if POST_CHECK.search(line):
            continue

        for pattern, reason in _DRIFT_PATTERNS:
            if pattern.search(line):
                hits.append((i + 1, line.strip(), reason))
                # One reason per line is enough.
                break
    return hits


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

    # -----------------------------------------------------------------------
    # Drift detector: flag any POST-related patterns the primary regex would
    # miss. A refactor that changes HOW routes check for POST (variable
    # aliasing, string literals, route table) must also update this script's
    # POST_CHECK regex — the drift detector forces that conversation instead
    # of silently letting ungated routes through.
    # -----------------------------------------------------------------------
    drift_hits = _check_drift(lines)

    if gaps:
        print(f"FAIL: {len(gaps)} POST route(s) missing _rejectNonJsonBody gate:")
        for line_num, text in gaps:
            print(f"  line {line_num}: {text}")
        print(
            "\nTo exempt a route, add a comment within "
            f"{LOOKAHEAD_LINES} lines containing:\n"
            "  // csrf-exempt: <reason>"
        )

    if drift_hits:
        print(
            f"\nFAIL: {len(drift_hits)} line(s) look like POST route checks "
            "but use a pattern this script does not scan for:"
        )
        for line_num, text, reason in drift_hits:
            print(f"  line {line_num}: {text}")
            print(f"    -> {reason}")
        print(
            "\nEither update POST_CHECK in this script to match the new "
            "pattern, or convert the code to the canonical form:\n"
            "  request.method == ServerConstants.methodPost"
        )

    if gaps or drift_hits:
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
