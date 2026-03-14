# -*- coding: utf-8 -*-
"""Dart package build steps: format, test, analyze, docs, dry-run."""

import os
import shutil
import sys

from modules.constants import REPO_ROOT, TEST_DIR
from modules.display import fail, fix, info, ok, print_cmd_output, warn
from modules.utils import run


def format_code() -> bool:
    """Run ``dart format .`` and report whether files changed."""
    result = run(["dart", "format", "."], cwd=REPO_ROOT)
    if result.returncode != 0:
        fail("dart format failed")
        print_cmd_output(result)
        return False

    status = run(["git", "status", "--porcelain"], cwd=REPO_ROOT)
    if status.stdout.strip():
        info("Files were formatted - will be included in commit")
    else:
        ok("All files already formatted")
    return True


def run_tests() -> bool:
    """Run ``flutter test`` if a ``test/`` directory exists."""
    if not os.path.isdir(TEST_DIR):
        warn("No test directory found, skipping unit tests")
        return True

    result = run(["flutter", "test"], cwd=REPO_ROOT)
    if result.returncode != 0:
        fail("Tests failed")
        print_cmd_output(result)
        return False
    ok("All tests passed")
    return True


def _analysis_options_without_plugins() -> tuple[str, str] | None:
    """Return ``(content_without_plugins, original)`` or None if no plugins block."""
    opts_path = os.path.join(REPO_ROOT, "analysis_options.yaml")
    try:
        with open(opts_path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return None

    lines = text.splitlines(keepends=True)
    for i, line in enumerate(lines):
        if line.startswith("plugins:") and not line.strip().startswith("#"):
            without = "".join(lines[:i]).rstrip() + "\n"
            return (without, text)
    return None


def run_analysis() -> bool:
    """Run ``dart analyze --fatal-infos``.

    Temporarily strips the ``plugins:`` block from analysis_options.yaml
    to avoid saropa_lints compatibility crashes during publish.
    """
    opts_path = os.path.join(REPO_ROOT, "analysis_options.yaml")
    backup_path = opts_path + ".publish_backup"
    modified = _analysis_options_without_plugins()

    try:
        if modified is not None:
            without_plugins, original = modified
            with open(backup_path, "w", encoding="utf-8") as f:
                f.write(original)
            with open(opts_path, "w", encoding="utf-8") as f:
                f.write(without_plugins)
            info("Temporarily disabled analyzer plugins")

        result = run(["flutter", "analyze", "--fatal-infos"], cwd=REPO_ROOT)
        if result.returncode != 0:
            fail("Static analysis failed")
            print_cmd_output(result)
            return False
        ok("Static analysis passed")
        return True
    finally:
        if os.path.isfile(backup_path):
            shutil.copy2(backup_path, opts_path)
            os.unlink(backup_path)
            info("Restored analysis_options.yaml")


def generate_docs() -> bool:
    """Run ``dart doc`` to generate API documentation."""
    result = run(["dart", "doc"], cwd=REPO_ROOT)
    if result.returncode != 0:
        fail("Documentation generation failed")
        return False
    ok("Documentation generated")
    return True


def run_downgrade_check() -> bool:
    """Run ``flutter pub downgrade`` then ``flutter analyze lib/``.

    Verifies lower-bound dependency compatibility (pub.dev score: support
    up-to-date dependencies). Ensures the package still analyzes clean when
    resolving to minimum allowed versions. Restores resolution with
    ``flutter pub upgrade`` afterward so the next step (outdated check) runs
    against normal resolution, not the downgraded lockfile.
    """
    downgrade = run(["flutter", "pub", "downgrade"], cwd=REPO_ROOT)
    if downgrade.returncode != 0:
        fail("flutter pub downgrade failed")
        print_cmd_output(downgrade)
        return False

    result = run(["flutter", "analyze", "lib/"], cwd=REPO_ROOT)
    if result.returncode != 0:
        fail("Analysis failed after downgrade (lower-bound compatibility)")
        print_cmd_output(result)
        return False
    ok("Downgrade check passed (lower-bound compatibility)")

    # Restore lockfile to latest-within-constraints so run_outdated_check sees
    # normal resolution; otherwise outdated would always report upgradable.
    restore = run(["flutter", "pub", "upgrade"], cwd=REPO_ROOT)
    if restore.returncode != 0:
        warn("Could not restore dependencies after downgrade (outdated check may fail)")

    return True


def run_outdated_check() -> bool:
    """Run ``dart pub outdated`` and require all dependencies up-to-date.

    Ensures dependency constraints accept latest stable (pub.dev score: support
    up-to-date dependencies). Exits with 1 if any package is upgradable.
    """
    result = run(
        [
            "dart",
            "pub",
            "outdated",
            "--no-dev-dependencies",
            "--no-dependency-overrides",
        ],
        cwd=REPO_ROOT,
    )
    if result.returncode != 0:
        fail("Dependencies not up-to-date (run: dart pub outdated)")
        print_cmd_output(result)
        return False
    ok("All dependencies up-to-date")
    return True


def pre_publish_validation() -> bool:
    """Run ``dart pub publish --dry-run``.

    Skipped on Windows due to a known Dart SDK path bug.
    """
    if sys.platform == "win32":
        warn("Skipping dry-run on Windows (known Dart SDK 'nul' path bug)")
        return True

    result = run(["dart", "pub", "publish", "--dry-run"], cwd=REPO_ROOT)
    if result.returncode in (0, 65):
        ok("Package validated successfully")
        return True

    fail("Pre-publish validation failed")
    print_cmd_output(result)
    return False
