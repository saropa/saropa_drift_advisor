#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Detect divergence between the web viewer sources and their generated artifacts.

`assets/web/bundle.js` and `assets/web/style.css` are GENERATED. `bundle.js` comes
from `node esbuild.config.mjs` (entry `assets/web/index.js`) and `style.css` from
`sass assets/web/style.scss`. Two failure modes recur in this repo:

  1. A source (`*.ts`, `app.js`, `*.scss`) is edited and `npm run build` is never
     run, so the shipped artifact silently keeps the old behavior.
  2. The generated file is hand-edited directly, so the change is destroyed by the
     next legitimate rebuild.

This gate catches both by comparing SHA-256 content hashes of the source set AND of
the artifacts against a committed manifest (`scripts/web_build_manifest.json`)
written at the moment of the last known-good build.

Why content hashing against a committed manifest, and not the alternatives
-------------------------------------------------------------------------
* **mtime comparison (rejected).** Git does not record or restore modification
  times. On a fresh CI checkout every file gets the checkout timestamp in
  arbitrary order, so "is the artifact newer than every source" is a coin flip.
  It would fail CI at random on a perfectly in-sync tree. mtime is used here in
  exactly one place where it *is* trustworthy — see the `--update` guard below.

* **Rebuild-and-diff (rejected).** Re-running esbuild and sass into a temp
  directory and byte-comparing against the committed artifacts needs no manifest
  and cannot be fooled. It was rejected because it makes the gate depend on an
  installed `node_modules` and, worse, on the exact esbuild and sass *versions*:
  a caret-range dependency bump changes generated output without any source
  change, turning every such bump into a spurious gate failure. It is also the
  slowest option, and this gate is meant to run in a pre-commit hook.

* **Content hashing against a committed manifest (chosen).** Deterministic,
  toolchain-free, millisecond-fast, and correct on a fresh clone because it
  compares content to content and never consults the filesystem clock. Hashing
  the artifacts as well as the sources is what makes it catch failure mode 2.

The honest cost of the chosen approach
--------------------------------------
The manifest is a second thing to keep current: after `npm run build` you must run
this script with `--update` and commit the result. A developer who edits a source,
runs `--update`, and never builds would produce a manifest that agrees with a stale
artifact. That hole is narrowed — not closed — by the `--update` mtime guard: at
manifest-write time we are on the developer's own machine immediately after a
build, which is the one moment mtimes are meaningful, so `--update` refuses to
write if any source file is newer than an artifact. `--force` overrides it for the
rare legitimate case (e.g. a source touched with no semantic change).

Usage:
    python scripts/check_web_build_freshness.py            # verify (CI / pre-commit)
    python scripts/check_web_build_freshness.py --update    # after `npm run build`
    python scripts/check_web_build_freshness.py --update --force
    python scripts/check_web_build_freshness.py --list      # show the tracked source set

Exit code: 0 when the artifacts are in sync with the sources; 1 on drift, on a
missing/unreadable manifest, or on a missing artifact.
"""

import argparse
import hashlib
import json
import sys
from pathlib import Path

# Repo root is one level up from this script's directory (matches the other gates).
REPO_ROOT = Path(__file__).resolve().parent.parent

WEB_DIR = REPO_ROOT / "assets" / "web"
MANIFEST = REPO_ROOT / "scripts" / "web_build_manifest.json"
PACKAGE_JSON = REPO_ROOT / "package.json"

# The two generated artifacts. Hashing these (not just the sources) is what lets
# the gate notice a hand-edit of a generated file.
ARTIFACTS = (
    "assets/web/bundle.js",
    "assets/web/style.css",
)

# Non-source files that nonetheless determine the generated output: change the
# bundler config and bundle.js changes with no source edit at all.
EXTRA_BUILD_INPUTS = ("esbuild.config.mjs",)

# package.json churns constantly for reasons unrelated to the web build, so only
# the build script *commands* are hashed, not the whole file.
TRACKED_NPM_SCRIPTS = ("build", "build:js", "build:style")

# Everything under assets/web with these suffixes is an input to one of the two
# builds. Order is irrelevant — the manifest is keyed by path.
SOURCE_SUFFIXES = (".ts", ".js", ".scss")

# Paths excluded from the source set, each for a specific reason:
#   bundle.js / style.css — the artifacts themselves, tracked separately.
#   *.d.ts                — ambient type declarations; erased by esbuild, so they
#                           can never change the emitted bundle.
#   test/                 — node:test suites, not bundled.
EXCLUDED_NAMES = {"bundle.js", "style.css"}
EXCLUDED_DIRS = {"test"}


def sha256_file(path: Path) -> str:
    """Return the hex SHA-256 of a file's raw bytes.

    Bytes, not text: reading as text would normalize line endings on Windows and
    hide a real CRLF/LF change in a generated file.
    """
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        # Chunked so bundle.js (hundreds of KB and growing) never loads whole.
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_text(text: str) -> str:
    """Return the hex SHA-256 of a string, for values not backed by a file."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def iter_sources() -> list[Path]:
    """Return every tracked web-build source file, sorted by relative path.

    Sorting makes the manifest diff-stable so a rebuild that changes nothing
    produces no manifest churn in review.
    """
    found: list[Path] = []
    for path in WEB_DIR.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in SOURCE_SUFFIXES:
            continue
        if path.name in EXCLUDED_NAMES:
            continue
        # Ambient declarations are type-only and cannot affect emitted output.
        if path.name.endswith(".d.ts"):
            continue
        # Skip anything under an excluded directory anywhere in the subtree.
        relative_parts = path.relative_to(WEB_DIR).parts[:-1]
        if EXCLUDED_DIRS.intersection(relative_parts):
            continue
        found.append(path)
    return sorted(found, key=lambda p: p.relative_to(REPO_ROOT).as_posix())


def rel(path: Path) -> str:
    """Repo-relative POSIX path — stable across Windows and Linux checkouts."""
    return path.relative_to(REPO_ROOT).as_posix()


def npm_build_scripts() -> dict[str, str]:
    """Extract the build-relevant npm script commands from package.json.

    Parsed as JSON rather than regex-scraped because package.json is guaranteed
    well-formed JSON and a missing key should be a loud failure, not a silent miss.
    """
    data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    scripts = data.get("scripts", {})
    return {name: scripts[name] for name in TRACKED_NPM_SCRIPTS if name in scripts}


def build_manifest() -> dict:
    """Hash the current tree into the manifest structure."""
    sources = {rel(p): sha256_file(p) for p in iter_sources()}

    artifacts: dict[str, str] = {}
    for name in ARTIFACTS:
        path = REPO_ROOT / name
        if not path.is_file():
            raise FileNotFoundError(f"generated artifact missing: {name}")
        artifacts[name] = sha256_file(path)

    build_inputs: dict[str, str] = {}
    for name in EXTRA_BUILD_INPUTS:
        path = REPO_ROOT / name
        if not path.is_file():
            raise FileNotFoundError(f"build input missing: {name}")
        build_inputs[name] = sha256_file(path)
    for name, command in npm_build_scripts().items():
        # Keyed distinctly from file paths so the two namespaces cannot collide.
        build_inputs[f"package.json#scripts.{name}"] = sha256_text(command)

    return {
        # Bumped only if the manifest shape changes, so an old manifest fails
        # loudly with a "regenerate" message instead of comparing garbage.
        "manifestVersion": 1,
        "sources": sources,
        "artifacts": artifacts,
        "buildInputs": build_inputs,
    }


def report_diff(label: str, old: dict[str, str], new: dict[str, str]) -> bool:
    """Print added/removed/changed entries. Returns True when they differ."""
    old_keys, new_keys = set(old), set(new)
    added = sorted(new_keys - old_keys)
    removed = sorted(old_keys - new_keys)
    changed = sorted(k for k in old_keys & new_keys if old[k] != new[k])

    if not (added or removed or changed):
        return False

    print(f"\n{label}:")
    for key in changed:
        print(f"  CHANGED  {key}")
    for key in added:
        print(f"  NEW      {key}")
    for key in removed:
        print(f"  DELETED  {key}")
    return True


def stale_sources_by_mtime() -> list[str]:
    """Sources modified after the oldest artifact, by filesystem mtime.

    ONLY valid at `--update` time on a developer machine right after a build; see
    the module docstring. Never used by the verification path.
    """
    artifact_mtimes = [
        (REPO_ROOT / name).stat().st_mtime
        for name in ARTIFACTS
        if (REPO_ROOT / name).is_file()
    ]
    if not artifact_mtimes:
        return []
    oldest_artifact = min(artifact_mtimes)
    # >= instead of > so that edits landing in the same filesystem-clock tick
    # as the build are flagged. On coarse-resolution filesystems (FAT, some CI
    # runners) a strict > can miss genuinely stale sources.
    return [rel(p) for p in iter_sources() if p.stat().st_mtime >= oldest_artifact]


def do_update(force: bool) -> int:
    """Regenerate and write the manifest from the current tree."""
    if not force:
        stale = stale_sources_by_mtime()
        if stale:
            print(
                "FAIL: refusing to write the manifest — these sources are newer "
                "than a generated artifact, which means the build was not re-run:",
                file=sys.stderr,
            )
            for name in stale:
                print(f"  - {name}", file=sys.stderr)
            print(
                "\nRun `npm run build` first, or pass --force if the edit cannot "
                "change the generated output.",
                file=sys.stderr,
            )
            return 1

    manifest = build_manifest()
    # Trailing newline and sorted keys keep the file diff-friendly in git.
    MANIFEST.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(
        f"OK: wrote {rel(MANIFEST)} — "
        f"{len(manifest['sources'])} sources, "
        f"{len(manifest['artifacts'])} artifacts, "
        f"{len(manifest['buildInputs'])} build inputs."
    )
    return 0


def do_check() -> int:
    """Compare the current tree against the committed manifest."""
    if not MANIFEST.is_file():
        print(
            f"ERROR: {rel(MANIFEST)} not found. Run `npm run build` then "
            f"`python scripts/check_web_build_freshness.py --update` and commit it.",
            file=sys.stderr,
        )
        return 1

    try:
        stored = json.loads(MANIFEST.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"ERROR: {rel(MANIFEST)} is not valid JSON: {exc}", file=sys.stderr)
        return 1

    if stored.get("manifestVersion") != 1:
        print(
            f"ERROR: {rel(MANIFEST)} has manifestVersion "
            f"{stored.get('manifestVersion')!r}, expected 1. Regenerate it with "
            f"--update after a build.",
            file=sys.stderr,
        )
        return 1

    try:
        current = build_manifest()
    except FileNotFoundError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    sources_differ = report_diff(
        "Web sources changed since the last recorded build",
        stored.get("sources", {}),
        current["sources"],
    )
    inputs_differ = report_diff(
        "Build configuration changed since the last recorded build",
        stored.get("buildInputs", {}),
        current["buildInputs"],
    )
    artifacts_differ = report_diff(
        "Generated artifacts differ from the last recorded build",
        stored.get("artifacts", {}),
        current["artifacts"],
    )

    if not (sources_differ or inputs_differ or artifacts_differ):
        print(
            f"OK: {len(current['sources'])} web sources and "
            f"{len(current['artifacts'])} generated artifacts match "
            f"{rel(MANIFEST)}."
        )
        return 0

    print("", file=sys.stderr)
    if artifacts_differ and not (sources_differ or inputs_differ):
        # Only the output moved: someone typed into a generated file.
        print(
            "FAIL: a generated artifact was modified without any source change. "
            "assets/web/bundle.js and assets/web/style.css are BUILD OUTPUT — edit "
            "the .ts/.js/.scss source instead, then run `npm run build`.",
            file=sys.stderr,
        )
    elif (sources_differ or inputs_differ) and not artifacts_differ:
        # Input moved, output did not: the rebuild was skipped.
        print(
            "FAIL: web sources changed but the generated artifacts did not. "
            "Run `npm run build`, then "
            "`python scripts/check_web_build_freshness.py --update`.",
            file=sys.stderr,
        )
    else:
        # Both moved: almost certainly a legitimate build with an unrefreshed manifest.
        print(
            "FAIL: sources and artifacts both changed since the manifest was "
            "written. If you have already run `npm run build`, refresh the "
            "manifest with "
            "`python scripts/check_web_build_freshness.py --update` and commit it.",
            file=sys.stderr,
        )
    return 1


def do_list() -> int:
    """Print the tracked source set — for auditing what this gate actually covers."""
    sources = iter_sources()
    for path in sources:
        print(rel(path))
    print(f"\n{len(sources)} tracked source files.")
    return 0


def main() -> int:
    """CLI entry point — parse flags and dispatch to check, update, or list."""
    parser = argparse.ArgumentParser(
        description=(
            "Verify assets/web/bundle.js and assets/web/style.css are in sync "
            "with their .ts/.js/.scss sources."
        )
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="Rewrite the manifest from the current tree (run after `npm run build`).",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="With --update, skip the mtime sanity check that the build was re-run.",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List the source files this gate tracks, then exit.",
    )
    args = parser.parse_args()

    if not WEB_DIR.is_dir():
        print(f"ERROR: {rel(WEB_DIR)} not found", file=sys.stderr)
        return 1

    # Dispatch order matters: --list is read-only, --update writes the
    # manifest, bare --force without --update is a user error, and the
    # default (no flags) runs the hash-comparison verification.
    if args.list:
        return do_list()
    if args.update:
        return do_update(force=args.force)
    if args.force:
        print("ERROR: --force is only meaningful with --update", file=sys.stderr)
        return 1
    return do_check()


if __name__ == "__main__":
    sys.exit(main())
