# -*- coding: utf-8 -*-
"""Dart SDK prerequisite checks."""

import os
import re

from modules.constants import C, PUBSPEC_PATH, REPO_ROOT
from modules.display import fail, info, ok
from modules.utils import command_exists, run


def check_dart() -> bool:
    """Verify the Dart SDK is installed."""
    if not command_exists("dart"):
        fail("dart not found. Install from https://dart.dev")
        return False
    result = run(["dart", "--version"], check=False)
    ok(f"dart -- {C.WHITE}{result.stdout.strip() or result.stderr.strip()}{C.RESET}")
    return True


def check_flutter() -> bool:
    """Verify Flutter is installed (needed for ``flutter test``)."""
    if not command_exists("flutter"):
        fail("flutter not found. Install from https://flutter.dev")
        return False
    result = run(["flutter", "--version"], check=False)
    lines = (result.stdout or "").strip().splitlines()
    first_line = lines[0] if lines else ""
    ok(f"flutter -- {C.WHITE}{first_line}{C.RESET}")
    return True


def check_publish_workflow() -> bool:
    """Verify the GitHub Actions publish workflow exists."""
    for name in ("publish.yml", "publish.yaml"):
        path = os.path.join(REPO_ROOT, ".github", "workflows", name)
        if os.path.isfile(path):
            ok(f"Publish workflow found ({name})")
            return True
    fail("No publish workflow at .github/workflows/publish.yml")
    info("Publishing relies on GitHub Actions. Add a workflow before releasing.")
    return False


def get_package_name() -> str:
    """Read the ``name`` field from ``pubspec.yaml``."""
    try:
        with open(PUBSPEC_PATH, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return "unknown"
    match = re.search(r"^name:\s*(.+)$", content, re.MULTILINE)
    return match.group(1).strip() if match else "unknown"
