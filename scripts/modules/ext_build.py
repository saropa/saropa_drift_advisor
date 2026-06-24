# -*- coding: utf-8 -*-
"""Extension build steps: dependencies, compile, test, quality."""

import json
import os
import re

from modules.constants import (
    C,
    MAX_FILE_LINES,
    MAX_TEST_FILE_LINES,
    EXTENSION_DIR,
    REPO_ROOT,
)
from modules.display import ask_choice, fail, fix, info, ok, print_cmd_output, warn
from modules.utils import run


def _semver_tuple(spec: str) -> tuple[int, int, int] | None:
    """Extract a (major, minor, patch) tuple from an npm version spec.

    Strips a leading range operator (``^``, ``~``, ``>=``, ``=``, ``v``) and
    parses the first three dotted numeric components. Returns None when no
    numeric version can be found (e.g. ``"*"``, ``"latest"``, a git URL) so
    callers can skip the comparison rather than crash on an unparseable range.
    """
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", spec or "")
    if not match:
        return None
    return (int(match.group(1)), int(match.group(2)), int(match.group(3)))


def check_engines_vscode_compat() -> bool:
    """Verify ``@types/vscode`` is not newer than ``engines.vscode``.

    ``vsce package`` hard-fails when the ``@types/vscode`` dev dependency
    promises a VS Code API version higher than the minimum declared in
    ``engines.vscode`` — the type definitions would expose APIs that the
    extension claims to run without. A Dependabot bump to ``@types/vscode``
    silently crossed this line and only surfaced at the packaging step deep
    in the pipeline; this check moves the failure to the fast quality phase
    with an actionable message. See the matching ``vsce`` rule:
    "@types/vscode ^X greater than engines.vscode ^Y".
    """
    pkg_json = os.path.join(EXTENSION_DIR, "package.json")
    try:
        with open(pkg_json, "r", encoding="utf-8") as fh:
            pkg = json.load(fh)
    except (OSError, json.JSONDecodeError) as exc:
        fail(f"Could not read extension package.json: {exc}")
        return False

    engines_spec = (pkg.get("engines") or {}).get("vscode", "")
    types_spec = (pkg.get("devDependencies") or {}).get("@types/vscode", "")

    # Missing either field is not this check's failure mode — a project may
    # legitimately omit @types/vscode. Only an actual, parseable mismatch fails.
    if not engines_spec or not types_spec:
        ok("engines.vscode / @types/vscode compatibility: nothing to compare")
        return True

    engines_ver = _semver_tuple(engines_spec)
    types_ver = _semver_tuple(types_spec)
    if engines_ver is None or types_ver is None:
        warn(
            "engines.vscode / @types/vscode compatibility: unparseable range "
            f"(engines={engines_spec!r}, @types/vscode={types_spec!r}) -- skipped"
        )
        return True

    if types_ver > engines_ver:
        fail(
            f"@types/vscode {types_spec} is newer than engines.vscode "
            f"{engines_spec}. vsce will reject packaging. Either pin "
            f"@types/vscode down to ^{engines_ver[0]}.{engines_ver[1]}.{engines_ver[2]} "
            f"to match the supported VS Code floor (keeps existing users), or "
            f"raise engines.vscode (drops users on older VS Code)."
        )
        return False

    ok(f"@types/vscode {types_spec} <= engines.vscode {engines_spec}")
    return True


def ensure_dependencies() -> bool:
    """Run npm install if node_modules is stale or missing."""
    node_modules = os.path.join(EXTENSION_DIR, "node_modules")
    pkg_json = os.path.join(EXTENSION_DIR, "package.json")

    if not os.path.isfile(pkg_json):
        fail("package.json not found.")
        return False

    if not os.path.isdir(node_modules):
        fix("node_modules/ missing -- running npm install...")
        return _run_npm_install()

    lock = os.path.join(node_modules, ".package-lock.json")
    if os.path.isfile(lock):
        if os.path.getmtime(pkg_json) > os.path.getmtime(lock):
            fix("package.json newer than lockfile -- running npm install...")
            return _run_npm_install()

    ok("node_modules/ up to date")
    return True


def _run_npm_install() -> bool:
    """Run npm install and report result."""
    result = run(["npm", "install"], cwd=EXTENSION_DIR, check=False)
    if result.returncode != 0:
        fail(f"npm install failed: {result.stderr.strip()}")
        return False
    ok("npm install completed")
    return True


def step_compile() -> bool:
    """Run the TypeScript compiler (``npm run compile``).

    After a successful tsc exit, verifies that the critical entry-point
    file ``out/extension.js`` actually exists on disk.  This guards
    against silent emit failures (e.g. empty outDir, disk-full, or
    tsconfig misconfiguration) that would produce a zero exit code but
    leave VS Code unable to activate the extension.
    """
    info("Running npm run compile...")
    result = run(["npm", "run", "compile"], cwd=EXTENSION_DIR, check=False)
    if result.returncode != 0:
        fail("Compile failed:")
        print_cmd_output(result)
        return False

    # Verify the critical entry-point file was actually emitted.
    entry_point = os.path.join(EXTENSION_DIR, "out", "extension.js")
    if not os.path.isfile(entry_point):
        fail(
            "tsc exited successfully but out/extension.js was not created. "
            "Check tsconfig.json outDir and rootDir settings."
        )
        return False

    ok("Compile passed (tsc) -- out/extension.js verified")
    return True


def step_test() -> bool:
    """Run the test suite via ``npm run test``."""
    info("Running npm run test...")
    result = run(["npm", "run", "test"], cwd=EXTENSION_DIR, check=False)
    if result.returncode != 0:
        fail("Tests failed:")
        print_cmd_output(result)
        return False
    ok("Tests passed")
    return True


def check_file_line_limits() -> bool:
    """Block on .ts files exceeding the line limit."""
    src_dir = os.path.join(EXTENSION_DIR, "src")
    violations: list[str] = []

    for dirpath, _dirs, filenames in os.walk(src_dir):
        for fname in filenames:
            if not fname.endswith(".ts"):
                continue
            filepath = os.path.join(dirpath, fname)
            with open(filepath, encoding="utf-8") as f:
                count = sum(1 for _ in f)
            # Test suites get a higher cap than production source — see constants.
            limit = MAX_TEST_FILE_LINES if fname.endswith(".test.ts") else MAX_FILE_LINES
            if count > limit:
                rel = os.path.relpath(filepath, REPO_ROOT)
                violations.append(f"{rel} ({count} lines, limit {limit})")

    if violations:
        warn(f"{len(violations)} file(s) exceed the line limit:")
        for v in violations:
            print(f"         {C.YELLOW}{v}{C.RESET}")
        # A line-limit overrun is advisory, so the gate offers three proceed-style
        # paths and no abort: retry re-scans after the user trims the files,
        # continue proceeds keeping the warning on record, ignore proceeds and
        # drops it. eof_default must be a terminal choice (continue), not retry —
        # a closed stdin in CI would otherwise re-scan the same files forever.
        choice = ask_choice(
            "Line limit exceeded.",
            choices=("retry", "continue", "ignore"),
            default="retry",
            eof_default="continue",
        )
        if choice == "retry":
            return check_file_line_limits()
        if choice == "ignore":
            ok("File line limits ignored")
            return True
        # continue
        ok(f"File line limits checked ({len(violations)} warning(s), continuing)")
        return True

    ok(f"File line limits checked ({len(violations)} warning(s))")
    return True
