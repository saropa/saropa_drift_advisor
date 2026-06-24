# -*- coding: utf-8 -*-
"""Dart package build steps: format, test, analyze, docs, dry-run."""

import os
import posixpath
import re

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


def _package_name() -> str:
    """Read the package name from pubspec.yaml (for resolving package: imports)."""
    pubspec = os.path.join(REPO_ROOT, "pubspec.yaml")
    try:
        with open(pubspec, encoding="utf-8") as f:
            for line in f:
                # The top-level `name:` key; first match wins (it is unindented).
                m = re.match(r"^name:\s*(\S+)", line)
                if m:
                    return m.group(1)
    except OSError:
        pass
    # Fallback to the known package name so resolution still works offline.
    return "saropa_drift_advisor"


def _all_dart_files() -> list[str]:
    """Every ``.dart`` file under lib/ and test/, repo-relative with / separators."""
    found: list[str] = []
    for sub in ("lib", "test"):
        root_dir = os.path.join(REPO_ROOT, sub)
        if not os.path.isdir(root_dir):
            continue
        for root, _dirs, filenames in os.walk(root_dir):
            for name in filenames:
                if name.endswith(".dart"):
                    rel = os.path.relpath(os.path.join(root, name), REPO_ROOT)
                    found.append(rel.replace("\\", "/"))
    return found


# A whole import/export/part DIRECTIVE statement, from a line-leading keyword to
# its terminating `;`. Spanning to the `;` (re.S) is required because a
# conditional directive wraps across lines:
#     export 'stub.dart'
#         if (dart.library.io) 'io.dart';
# A per-line scan would see only the first path. `re.M` anchors `^` at line
# starts so the keyword is a real directive, not the word "import" inside code.
_DIRECTIVE_RE = re.compile(r"^\s*(?:import|export|part)\b.*?;", re.M | re.S)
# Block comments are stripped before matching so a commented-out directive does
# not register as a real dependency.
_BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.S)
# Every quoted `.dart` target within a directive (both conditional branches).
_QUOTED_DART_RE = re.compile(r"""['"]([^'"]+\.dart)['"]""")


def _direct_deps(rel_path: str, pkg: str, valid: set[str]) -> set[str]:
    """Intra-package files [rel_path] imports/exports/parts, resolved to repo paths.

    Resolves both `package:<pkg>/...` (→ ``lib/...``) and relative targets against
    the importing file's directory, across multi-line conditional directives.
    Anything outside the package (``dart:``, other `package:` deps) or not present
    in [valid] is dropped, so the graph stays inside this repo.
    """
    abs_path = os.path.join(REPO_ROOT, rel_path)
    deps: set[str] = set()
    try:
        with open(abs_path, encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return deps

    text = _BLOCK_COMMENT_RE.sub("", text)
    base_dir = posixpath.dirname(rel_path)
    pkg_prefix = f"package:{pkg}/"
    for stmt in _DIRECTIVE_RE.findall(text):
        for target in _QUOTED_DART_RE.findall(stmt):
            if target.startswith(pkg_prefix):
                cand = "lib/" + target[len(pkg_prefix):]
            elif target.startswith("package:") or target.startswith("dart:"):
                continue
            else:
                cand = posixpath.normpath(posixpath.join(base_dir, target))
            if cand in valid:
                deps.add(cand)
    return deps


def _select_affected_tests(
    changed: list[str],
) -> tuple[list[str], list[str]]:
    """Select tests whose import closure touches a changed file (true impact).

    Builds the package import graph, then for each ``*_test.dart`` computes its
    transitive dependency closure (including itself). A test is selected when its
    closure intersects [changed] — so editing ``drift_debug_server_io.dart`` pulls
    in every test that imports it (directly or through a chain), and editing a
    test file selects that test. This is the "outdated tests" set the editor's
    Test Explorer shows, computed without the editor.

    Returns ``(selected_tests, uncovered_sources)`` where uncovered_sources are
    changed library files that NO test reaches — a genuine coverage gap (not a
    naming miss), surfaced so it is logged rather than hidden.
    """
    pkg = _package_name()
    valid = set(_all_dart_files())
    changed_set = {c.replace("\\", "/") for c in changed} & valid

    # Adjacency list for the whole package.
    graph = {f: _direct_deps(f, pkg, valid) for f in valid}

    # Memoized transitive closure (iterative DFS; closure includes the start node).
    closures: dict[str, set[str]] = {}

    def closure(start: str) -> set[str]:
        cached = closures.get(start)
        if cached is not None:
            return cached
        seen: set[str] = set()
        stack = [start]
        while stack:
            cur = stack.pop()
            if cur in seen:
                continue
            seen.add(cur)
            for dep in graph.get(cur, ()):  # noqa: B905 - set has no len concern
                if dep not in seen:
                    stack.append(dep)
        closures[start] = seen
        return seen

    test_files = [
        f for f in valid if f.startswith("test/") and f.endswith("_test.dart")
    ]

    selected: set[str] = set()
    covered: set[str] = set()
    for test in test_files:
        reach = closure(test)
        covered |= reach
        if reach & changed_set:
            selected.add(test)

    # Changed library sources reached by no test at all = real coverage gap.
    uncovered = sorted(
        c for c in changed_set if c.startswith("lib/") and c not in covered
    )
    return sorted(selected), uncovered


def run_tests() -> bool:
    """Run the tests actually affected by this release's changes (import-graph).

    A test is selected when its transitive import closure includes a changed file
    — the same "this result is stale" set the editor's Test Explorer fades, but
    computed from the dependency graph instead of the editor. This removes the
    naming-heuristic blind spot: a change to a core file with no same-named test
    still runs every test that imports it through any chain. A changed library
    file that NO test reaches is a real coverage gap and is logged. The only
    full-suite paths are unreadable git history (no delta computable) and an
    explicit ``PUBLISH_FULL_TESTS=1``.
    """
    if not os.path.isdir(TEST_DIR):
        warn("No test directory found, skipping unit tests")
        return True

    if os.environ.get("PUBLISH_FULL_TESTS", "").strip():
        info("PUBLISH_FULL_TESTS set — running the full test suite.")
        return _run_flutter_test([])

    changed = _changed_dart_files()
    if changed is None:
        # No delta can be computed without history — full suite is the only
        # correct choice here (this is not the "uncovered change" case).
        warn("Could not determine changed files from git — running full suite.")
        return _run_flutter_test([])

    if not changed:
        ok("No Dart changes since the last release — skipping tests.")
        return True

    selected, uncovered = _select_affected_tests(changed)

    # A changed library file no test imports is a genuine coverage gap, not a
    # naming miss. Log it (never silent); PUBLISH_FULL_TESTS=1 forces the full gate.
    if uncovered:
        warn(
            f"{len(uncovered)} changed library file(s) are imported by NO test "
            "(genuine coverage gap):"
        )
        for path in uncovered:
            info(f"  - {path}")

    if not selected:
        warn(
            "No tests import the changed files — skipping tests. "
            "Set PUBLISH_FULL_TESTS=1 to run the full suite."
        )
        return True

    info(f"Affected test run — {len(selected)} test file(s) import a change:")
    for path in selected:
        info(f"  - {path}")
    return _run_flutter_test(selected)


def run_analysis() -> bool:
    """Run the EXACT analyze command the publish CI runs, as a pre-tag gate.

    Mirrors `.github/workflows/publish.yml` step ``flutter analyze
    --fatal-warnings`` byte-for-byte:
      - ``--fatal-warnings`` (NOT ``--fatal-infos``): same threshold as CI, so a
        clean local run guarantees a clean CI analyze. CI deliberately tolerates
        info-level diagnostics because saropa_lints is an unpinned caret dep whose
        newest version can add an info rule at any time; matching that here avoids
        the reverse divergence where the local gate fails on advisory noise CI
        would have passed.
      - the ``plugins:`` block in analysis_options.yaml is left INTACT, so
        saropa_lints runs exactly as it does in CI.

    BUG FIX: this step previously stripped the ``plugins:`` block and ran
    ``--fatal-infos``. Stripping the plugins disabled saropa_lints locally — the
    very rules (avoid_swallowing_exceptions, require_catch_logging, etc.) that
    fail CI's ``flutter analyze --fatal-warnings``. The local gate therefore
    PASSED on code CI would reject, the script went on to commit/tag/push, and CI
    only then caught the warnings — blocking the pub.dev publish AFTER the VS Code
    extension had already been published locally. That is the "publishes to one
    store with obvious problems" failure: the pre-publish gate must run the same
    analyzer configuration CI does, or it is not a gate. Run BEFORE any
    commit/tag/push so a failure here never triggers CI and never ships either
    store.
    """
    result = run(["flutter", "analyze", "--fatal-warnings"], cwd=REPO_ROOT)
    if result.returncode != 0:
        fail("Static analysis failed (flutter analyze --fatal-warnings)")
        print_cmd_output(result)
        return False
    ok("Static analysis passed (matches CI: flutter analyze --fatal-warnings)")
    return True


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
