#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Dangling bug-reference check.

Scans files for `bugs/<filename>.md` path references where the target
file no longer exists in the `bugs/` directory. Catches stale
references left behind after archiving closed bugs to `plans/history/`.

By default (pre-commit mode) only checks staged files. Pass `--all`
to scan every tracked text file in the repo — useful for periodic
repo-wide sweeps.

Usage:
    python scripts/check_bug_ref_dangling.py          # staged only
    python scripts/check_bug_ref_dangling.py --all    # repo-wide

Exit code: 0 when no dangling references found; 1 on any stale path.
"""

import re
import subprocess
import sys
from pathlib import Path

# Repo root is one level up from this script's directory.
REPO_ROOT = Path(__file__).resolve().parent.parent
BUGS_DIR = REPO_ROOT / "bugs"
HISTORY_DIR = REPO_ROOT / "plans" / "history"

# Matches any bugs/<name>.md path reference — not just NNN_ prefixed
# filenames. Catches numbered bugs (012_...), proposals (proposal_...),
# infra files, and any other naming convention in the bugs/ directory.
BUG_REF = re.compile(r"bugs/([A-Za-z0-9][A-Za-z0-9_]*\.md)")

# Lines containing this marker are template examples or exempted
# references — not real file paths. Same pattern as csrf-exempt: in
# the CSRF gate script.
EXEMPT_MARKER = re.compile(r"ref-exempt:", re.IGNORECASE)

# Paths that legitimately contain old bugs/... strings as historical
# context, not live references. CHANGELOG entries describe what
# happened; plans/history/ and docs/handover/ are archival records.
EXCLUDED_PREFIXES = (
    "plans/history/",
    "docs/handover/",
    "CHANGELOG",
)

# Text file extensions to check. Broad enough to catch references in
# scripts, configs, docs, and source code.
TEXT_EXTENSIONS = (
    ".md", ".py", ".dart", ".ts", ".tsx", ".js", ".mjs", ".cjs",
    ".yml", ".yaml", ".json", ".html", ".sh", ".cfg", ".txt",
)


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


def _tracked_files() -> list[str]:
    """Return all tracked files in the repo (for --all mode)."""
    result = subprocess.run(
        ["git", "ls-files"],
        capture_output=True,
        text=True,
        cwd=REPO_ROOT,
    )
    return [f for f in result.stdout.strip().splitlines() if f]


def _find_archived_path(bug_filename: str) -> str | None:
    """Search plans/history/ for the archived bug file.

    Returns the relative path if found, so the error message can
    suggest the correct replacement.
    """
    if not HISTORY_DIR.is_dir():
        return None

    # Walk the history tree looking for a file with the same name.
    for match in HISTORY_DIR.rglob(bug_filename):
        # Return path relative to repo root.
        return str(match.relative_to(REPO_ROOT)).replace("\\", "/")

    return None


def main() -> int:
    # Parse --all flag for repo-wide scanning.
    scan_all = "--all" in sys.argv

    if scan_all:
        candidates = _tracked_files()
    else:
        candidates = _staged_files()

    if not candidates:
        label = "tracked" if scan_all else "staged"
        print(f"No {label} files — skipping dangling bug-reference check")
        return 0

    # Filter out archival/historical files and non-text files.
    checkable = [
        f
        for f in candidates
        if not any(f.startswith(p) for p in EXCLUDED_PREFIXES)
        and f.endswith(TEXT_EXTENSIONS)
    ]

    if not checkable:
        print("No text files to check — skipping dangling bug-reference check")
        return 0

    danglers: list[tuple[str, int, str, str, str | None]] = []

    for rel_path in checkable:
        full_path = REPO_ROOT / rel_path
        if not full_path.is_file():
            continue

        try:
            lines = full_path.read_text(encoding="utf-8").splitlines()
        except (UnicodeDecodeError, OSError):
            # Binary or unreadable — skip silently.
            continue

        for line_num, line in enumerate(lines, start=1):
            # Skip lines with the exemption marker (template examples).
            if EXEMPT_MARKER.search(line):
                continue

            for match in BUG_REF.finditer(line):
                bug_filename = match.group(1)
                bug_path = BUGS_DIR / bug_filename

                # Only flag if the file does NOT exist in bugs/.
                if not bug_path.is_file():
                    # Try to find where it was archived.
                    archived = _find_archived_path(bug_filename)
                    danglers.append(
                        (rel_path, line_num, bug_filename, line.strip(), archived)
                    )

    if danglers:
        print(f"FAIL: {len(danglers)} dangling bug reference(s) found:")
        for rel_path, line_num, bug_file, text, archived in danglers:
            print(f"  {rel_path}:{line_num}: bugs/{bug_file}")
            print(f"    {text}")
            if archived:
                # Suggest the correct replacement path.
                print(f"    -> archived at: {archived}")
        print(
            "\nThese bugs have been archived. Update the reference to the "
            "new path in plans/history/ or remove it."
        )
        return 1

    # Summary.
    label = "tracked" if scan_all else "staged"
    print(f"OK: {len(checkable)} {label} file(s) checked, no dangling bug references")
    return 0


if __name__ == "__main__":
    sys.exit(main())
