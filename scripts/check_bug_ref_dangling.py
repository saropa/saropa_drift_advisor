#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dangling bug-reference check.

Scans staged files for `bugs/<filename>.md` path references where the
target file no longer exists in the `bugs/` directory. Catches stale
references left behind after archiving closed bugs to `plans/history/`.

Only checks references in staged files (not the entire repo) so the
cost stays proportional to the commit size.

Usage:
    python scripts/check_bug_ref_dangling.py

Exit code: 0 when no dangling references found; 1 on any stale path.
"""

import re
import subprocess
import sys
from pathlib import Path

# Repo root is one level up from this script's directory.
REPO_ROOT = Path(__file__).resolve().parent.parent
BUGS_DIR = REPO_ROOT / "bugs"

# Matches path references like bugs/NNN_something.md in any context —
# markdown links, plain text, comments. The captured group is the
# filename portion (without the prefix).
BUG_REF = re.compile(r"bugs/(\d{3}_[A-Za-z0-9_]+\.md)")

# Files inside plans/history/ are archival records that legitimately
# describe what was moved — their "bugs/..." strings are historical
# context, not live references.
HISTORY_PREFIX = "plans/history/"


def _staged_files() -> list[str]:
    """Return list of staged file paths (relative to repo root).

    Excludes deleted files — a deleted file cannot contain a dangling
    reference. Uses --diff-filter=d to match the pre-commit hook
    convention.
    """
    result = subprocess.run(
        ["git", "diff", "--cached", "--name-only", "--diff-filter=d"],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    return [f for f in result.stdout.strip().splitlines() if f]


def main() -> int:
    staged = _staged_files()
    if not staged:
        # Nothing staged — nothing to check.
        print("No staged files — skipping dangling bug-reference check")
        return 0

    # Filter out history files and binary-looking paths.
    checkable = [
        f
        for f in staged
        if not f.startswith(HISTORY_PREFIX)
        and f.endswith((".md", ".py", ".dart", ".ts", ".tsx", ".yml", ".yaml", ".json"))
    ]

    if not checkable:
        print("No text files staged outside history — skipping dangling bug-reference check")
        return 0

    danglers: list[tuple[str, int, str, str]] = []

    for rel_path in checkable:
        full_path = REPO_ROOT / rel_path
        if not full_path.is_file():
            continue

        try:
            lines = full_path.read_text(encoding="utf-8").splitlines()
        except (UnicodeDecodeError, OSError):
            # Binary or unreadable — skip.
            continue

        for line_num, line in enumerate(lines, start=1):
            for match in BUG_REF.finditer(line):
                bug_filename = match.group(1)
                bug_path = BUGS_DIR / bug_filename

                # Only flag if the file does NOT exist in bugs/.
                if not bug_path.is_file():
                    danglers.append(
                        (rel_path, line_num, bug_filename, line.strip())
                    )

    if danglers:
        print(f"FAIL: {len(danglers)} dangling bug reference(s) found:")
        for rel_path, line_num, bug_file, text in danglers:
            print(f"  {rel_path}:{line_num}: bugs/{bug_file}")
            print(f"    {text}")
        print(
            "\nThese bugs have been archived. Update the reference to the "
            "new path in plans/history/ or remove it."
        )
        return 1

    # Summary.
    print(f"OK: {len(checkable)} staged file(s) checked, no dangling bug references")
    return 0


if __name__ == "__main__":
    sys.exit(main())
