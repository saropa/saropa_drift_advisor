# -*- coding: utf-8 -*-
"""Dart package build steps: format, test, analyze, docs, dry-run."""

import os
import shutil

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


def _run_flutter_test(files: list[str]) -> bool:
    """Run ``flutter test`` over [files] (whole suite when [files] is empty)."""
    cmd = ["flutter", "test", *files]
    result = run(cmd, cwd=REPO_ROOT)
    if result.returncode != 0:
        fail("Tests failed")
        print_cmd_output(result)
        return False
    ok("All tests passed")
    return True


def _changed_dart_files() -> list[str] | None:
    """Dart files changed since the last release, including the working tree.

    Baseline is the most recent git tag (= the previous published release), so the
    delta is "everything that changed for THIS release". Falls back to ``HEAD~1``
    when no tag is reachable (shallow clone / fresh repo). Returns None when git
    cannot answer at all, which the caller treats as "run the full suite" — a
    delta run must never be guessed from incomplete history.

    Override the baseline with the ``PUBLISH_TEST_BASELINE`` env var (any git
    revision) when you need to diff against something other than the last tag.
    """
    baseline = os.environ.get("PUBLISH_TEST_BASELINE", "").strip()
    if not baseline:
        described = run(
            ["git", "describe", "--tags", "--abbrev=0"], cwd=REPO_ROOT
        )
        baseline = (
            described.stdout.strip()
            if described.returncode == 0 and described.stdout.strip()
            else "HEAD~1"
        )

    names: set[str] = set()
    # Committed changes since the baseline.
    diff = run(["git", "diff", "--name-only", baseline, "HEAD"], cwd=REPO_ROOT)
    if diff.returncode != 0:
        return None
    names.update(diff.stdout.split())

    # Uncommitted + untracked changes (the version bump and any last edits are
    # usually still in the working tree at publish time).
    status = run(["git", "status", "--porcelain"], cwd=REPO_ROOT)
    if status.returncode == 0:
        for line in status.stdout.splitlines():
            # Porcelain lines are "XY <path>"; the path starts at column 3.
            path = line[3:].strip()
            # Renames render as "old -> new"; keep the new path only.
            if " -> " in path:
                path = path.split(" -> ", 1)[1]
            if path:
                names.add(path)

    return [n for n in names if n.endswith(".dart")]


def _index_test_files() -> dict[str, str]:
    """Map each ``*_test.dart`` basename under TEST_DIR to its repo-relative path."""
    index: dict[str, str] = {}
    for root, _dirs, filenames in os.walk(TEST_DIR):
        for name in filenames:
            if name.endswith("_test.dart"):
                full = os.path.join(root, name)
                index[name] = os.path.relpath(full, REPO_ROOT).replace("\\", "/")
    return index


def _select_delta_tests(
    changed: list[str],
) -> tuple[list[str], list[str]]:
    """Pick the test files to run for [changed]; report unmatched source files.

    Two mapping rules, matching this package's flat ``test/`` layout:
      * a changed ``*_test.dart`` runs directly, and
      * a changed source file ``foo.dart`` runs ``foo_test.dart`` when one exists
        (matched by basename, since tests are not nested to mirror ``lib/src/``).

    Returns ``(test_files, unmatched_sources)`` where unmatched_sources are
    changed Dart sources with no basename-matching test — surfaced to the caller
    so the gap is logged, never silently dropped.
    """
    test_index = _index_test_files()
    selected: set[str] = set()
    unmatched: list[str] = []

    for path in changed:
        norm = path.replace("\\", "/")
        base = os.path.basename(norm)
        if base.endswith("_test.dart"):
            # A changed test file: run it if it still exists on disk.
            if os.path.isfile(os.path.join(REPO_ROOT, norm)):
                selected.add(norm)
            continue
        # A changed source file: look for its basename-mirror test.
        mirror = base[: -len(".dart")] + "_test.dart"
        if mirror in test_index:
            selected.add(test_index[mirror])
        else:
            unmatched.append(norm)

    return sorted(selected), unmatched


def run_tests() -> bool:
    """Run only the tests affected by this release's changes (delta run).

    Fast path: when every changed Dart file maps to a test, run just those. The
    gate stays safe through explicit fallbacks — it reverts to the FULL suite
    when git history is unreadable or when changes exist that map to no test, so
    a release is never published on zero or partial coverage without that being
    forced. Set ``PUBLISH_FULL_TESTS=1`` to always run the whole suite.
    """
    if not os.path.isdir(TEST_DIR):
        warn("No test directory found, skipping unit tests")
        return True

    if os.environ.get("PUBLISH_FULL_TESTS", "").strip():
        info("PUBLISH_FULL_TESTS set — running the full test suite.")
        return _run_flutter_test([])

    changed = _changed_dart_files()
    if changed is None:
        warn("Could not determine changed files from git — running full suite.")
        return _run_flutter_test([])

    if not changed:
        ok("No Dart changes since the last release — skipping tests.")
        return True

    selected, unmatched = _select_delta_tests(changed)

    # Changed sources with no matching test mean we cannot prove this delta is
    # covered. Rather than ship a partially-tested release, fall back to the full
    # suite — but say exactly why, so the gap is visible, not silent.
    if unmatched:
        warn(
            f"{len(unmatched)} changed Dart file(s) have no matching *_test.dart; "
            "running the full suite to stay safe:"
        )
        for path in unmatched:
            info(f"  - {path}")
        return _run_flutter_test([])

    info(f"Delta test run — {len(selected)} affected test file(s):")
    for path in selected:
        info(f"  - {path}")
    return _run_flutter_test(selected)


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

    Runs on every platform. The historical Windows 'nul' path crash in older Dart
    SDKs is gone (verified clean on 3.12.1), so the unconditional Windows skip that
    used to live here was dropped — skipping meant Windows publishes shipped to
    pub.dev with no local package validation at all.

    Treats exit 65 as a pass alongside 0: `--dry-run` returns 65 when it surfaces
    advisory warnings (e.g. a not-yet-committed file during the analysis phase),
    which is informational here, not a validation failure.
    """
    result = run(["dart", "pub", "publish", "--dry-run"], cwd=REPO_ROOT)
    if result.returncode in (0, 65):
        ok("Package validated successfully")
        return True

    fail("Pre-publish validation failed")
    print_cmd_output(result)
    return False
