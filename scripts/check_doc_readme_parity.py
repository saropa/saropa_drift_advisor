#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Verify every doc/*.md file appears in the README.md Documentation table.

Compares the set of Markdown files in doc/ (excluding generated api/ subdir)
against the doc/ links in the README's "Documentation and resources" table.
Exits 1 if any doc file is missing from the table.

Usage:
    python scripts/check_doc_readme_parity.py
"""

import re
import sys
from pathlib import Path

# Repo root is one level up from scripts/
REPO = Path(__file__).resolve().parent.parent
DOC_DIR = REPO / "doc"
README = REPO / "README.md"


def get_doc_files() -> set[str]:
    """Return basenames of all .md files directly in doc/ (not subdirs)."""
    return {f.name for f in DOC_DIR.glob("*.md")}


def get_readme_doc_links() -> set[str]:
    """Return doc/*.md basenames referenced in README table rows."""
    text = README.read_text(encoding="utf-8")
    # Match markdown links like [doc/SOMETHING.md](doc/SOMETHING.md)
    return set(re.findall(r"\(doc/([A-Za-z0-9_.-]+\.md)\)", text))


def main() -> int:
    if not DOC_DIR.is_dir():
        print(f"ERROR: {DOC_DIR} not found", file=sys.stderr)
        return 1
    if not README.is_file():
        print(f"ERROR: {README} not found", file=sys.stderr)
        return 1

    doc_files = get_doc_files()
    readme_links = get_readme_doc_links()

    # Files in doc/ but missing from README
    missing = sorted(doc_files - readme_links)
    # Links in README pointing to files that don't exist
    stale = sorted(readme_links - doc_files)

    ok = True
    if missing:
        print(f"doc/ files missing from README table ({len(missing)}):")
        for f in missing:
            print(f"  - {f}")
        ok = False
    if stale:
        print(f"README links to non-existent doc/ files ({len(stale)}):")
        for f in stale:
            print(f"  - {f}")
        ok = False

    if ok:
        print(f"OK: all {len(doc_files)} doc/*.md files listed in README.")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
