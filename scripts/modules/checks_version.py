# -*- coding: utf-8 -*-
"""Version validation and CHANGELOG management.

Handles version resolution, CHANGELOG stamping, and tag availability
checks. These are the most complex pre-publish validations; keeping
them separate from git/build checks improves readability.
"""

import datetime
import os
import re
import sys

from modules.constants import C, EXTENSION_DIR, TAG_PREFIX
from modules.display import ask_yn, fail, fix, ok, warn
from modules.utils import is_version_tagged as _is_version_tagged, read_package_version


# ── Helpers ───────────────────────────────────────────────


def _parse_semver(version: str) -> tuple[int, ...]:
    """Parse a semver string into a tuple of ints for comparison."""
    return tuple(int(x) for x in version.split("."))


def _get_changelog_max_version() -> str | None:
    """Return the highest versioned heading in CHANGELOG.md, or None."""
    changelog_path = os.path.join(EXTENSION_DIR, "CHANGELOG.md")
    versions: list[str] = []
    try:
        with open(changelog_path, encoding="utf-8") as f:
            for line in f:
                m = re.match(r'^## \[(\d+\.\d+\.\d+)\]', line)
                if m:
                    versions.append(m.group(1))
    except OSError:
        return None
    if not versions:
        return None
    return max(versions, key=_parse_semver)


def _bump_patch(version: str) -> str:
    """Increment the patch component of a semver string."""
    major, minor, patch = version.split(".")
    return f"{major}.{minor}.{int(patch) + 1}"


# ── User Prompts ──────────────────────────────────────────


def _ask_version(current: str) -> str | None:
    """Prompt user to confirm or override the version. Returns version or None."""
    if not sys.stdin.isatty():
        # Non-interactive (e.g. IDE terminal with no stdin): accept default
        return current
    try:
        answer = input(
            f"  {C.YELLOW}Publish as v{current}? "
            f"[Y/n/version]: {C.RESET}",
        ).strip()
    except (EOFError, KeyboardInterrupt):
        print()
        return None
    if not answer or answer.lower() in ("y", "yes"):
        return current
    if answer.lower() in ("n", "no"):
        return None
    # Treat as a version string -- validate basic semver shape
    if re.match(r'^\d+\.\d+\.\d+$', answer):
        return answer
    fail(f"Invalid version format: {answer} (expected x.y.z)")
    return None


def _offer_bump_and_apply(
    current: str, next_ver: str, fail_msg: str, default_yes: bool = True
) -> tuple[str, bool]:
    """Ask to bump to next_ver; if yes, write package.json and report. Returns (version, ok)."""
    if not ask_yn(f"Bump to v{next_ver}?", default=default_yes):
        fail(fail_msg)
        return current, False
    if not _write_package_version(next_ver):
        return current, False
    fix(f"package.json: {current} -> {C.WHITE}{next_ver}{C.RESET}")
    return next_ver, True


# ── package.json Version ──────────────────────────────────


def _write_package_version(version: str) -> bool:
    """Write a new version string into package.json.

    Uses regex replacement to preserve key order and formatting,
    avoiding json.dump which alphabetizes keys.
    """
    pkg_path = os.path.join(EXTENSION_DIR, "package.json")
    try:
        with open(pkg_path, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        fail("Could not read package.json")
        return False

    updated, count = re.subn(
        r'("version"\s*:\s*")([^"]+)(")',
        rf'\g<1>{version}\3',
        content,
        count=1,
    )
    if count == 0:
        fail("Could not find 'version' field in package.json")
        return False

    try:
        with open(pkg_path, "w", encoding="utf-8") as f:
            f.write(updated)
    except OSError:
        fail("Could not write package.json")
        return False
    return True


# ── CHANGELOG ─────────────────────────────────────────────


# Keywords that mean "changelog not yet published" (any triggers auto-bump when tag exists).
_UNPUBLISHED_HEADING_RE = re.compile(
    r'^##\s*\[(?:Unreleased|Unpublished|Undefined)\]', re.IGNORECASE | re.MULTILINE
)

# First release heading: ## [x.y.z] or ## [x.y.z] - date (so we know where to insert [Unreleased])
_FIRST_RELEASE_HEADING_RE = re.compile(r'^##\s*\[\d+\.\d+\.\d+\]', re.MULTILINE)


def _changelog_has_unpublished_heading() -> bool:
    """True if CHANGELOG has ## [Unreleased], [Unpublished], or [Undefined]."""
    changelog_path = os.path.join(EXTENSION_DIR, "CHANGELOG.md")
    try:
        with open(changelog_path, encoding="utf-8") as f:
            for line in f:
                if _UNPUBLISHED_HEADING_RE.match(line):
                    return True
    except OSError:
        pass
    return False


def _has_unreleased_section() -> bool:
    """Check if CHANGELOG.md has an ## [Unreleased] section.

    The [Unreleased] heading (per Keep a Changelog convention) indicates
    work-in-progress changes. During publish, it gets replaced with the
    version number and today's date. Also accepts [Unpublished] / [Undefined].
    """
    return _changelog_has_unpublished_heading()


def _ensure_unreleased_section() -> bool:
    """If CHANGELOG has no ## [Unreleased], insert it before the first ## [x.y.z] section.

    Keeps Keep a Changelog convention; the stamp step will replace it with [version] - date.
    Returns True if the file now has an unreleased heading (added or already present).
    """
    if _changelog_has_unpublished_heading():
        return True
    changelog_path = os.path.join(EXTENSION_DIR, "CHANGELOG.md")
    try:
        with open(changelog_path, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        fail("Could not read CHANGELOG.md")
        return False
    match = _FIRST_RELEASE_HEADING_RE.search(content)
    if not match:
        fail("CHANGELOG.md has no ## [Unreleased] and no ## [x.y.z] release heading.")
        return False
    insert = "## [Unreleased]\n\n"
    new_content = content[: match.start()] + insert + content[match.start() :]
    try:
        with open(changelog_path, "w", encoding="utf-8") as f:
            f.write(new_content)
    except OSError:
        fail("Could not write CHANGELOG.md")
        return False
    fix("Added ## [Unreleased] to CHANGELOG.md")
    return True


def _stamp_changelog(version: str) -> bool:
    """Replace '## [Unreleased]' (or [Unpublished]/[Undefined]) with '## [version] - date'.

    Called during validation so the CHANGELOG is finalized before
    packaging. If publish is cancelled, the change is uncommitted
    and easily reverted with git.
    """
    changelog_path = os.path.join(EXTENSION_DIR, "CHANGELOG.md")
    try:
        with open(changelog_path, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        fail("Could not read CHANGELOG.md")
        return False

    today = datetime.datetime.now().strftime("%Y-%m-%d")
    replacement = f'## [{version}] - {today}'
    updated, count = _UNPUBLISHED_HEADING_RE.subn(replacement, content, count=1)
    if count == 0:
        fail("Could not find '## [Unreleased]' (or [Unpublished]/[Undefined]) in CHANGELOG.md")
        return False

    try:
        with open(changelog_path, "w", encoding="utf-8") as f:
            f.write(updated)
    except OSError:
        fail("Could not write CHANGELOG.md")
        return False

    ok(f"CHANGELOG: [Unreleased] -> [{version}] - {today}")
    return True


# ── Tag Availability ──────────────────────────────────────


def _ensure_untagged_version(version: str) -> tuple[str, bool]:
    """If the version is already tagged, offer to bump patch.

    Keeps bumping until an available tag is found or the user declines.
    Returns (resolved_version, success).
    """
    original = version
    while _is_version_tagged(version):
        next_ver = _bump_patch(version)
        warn(f"Tag '{TAG_PREFIX}{version}' already exists.")
        if not ask_yn(f"Bump to {next_ver}?", default=True):
            fail("Version already tagged. Bump manually.")
            return version, False
        version = next_ver

    if version != original:
        if not _write_package_version(version):
            return version, False
        fix(f"package.json: {original} -> {C.WHITE}{version}{C.RESET}")
    ok(f"Tag '{TAG_PREFIX}{version}' is available")
    return version, True


# ── Main Validation ───────────────────────────────────────


def validate_version_changelog() -> tuple[str, bool]:
    """Validate version, resolve tag conflicts, confirm, and stamp CHANGELOG.

    1. package.json must have a valid version (source of truth)
    2. Version must be greater than the highest released version in CHANGELOG
    3. CHANGELOG.md must have ## [Unreleased] or [Unpublished] or [Undefined]
    4. The version must not already be tagged (auto-bumps if so)
    5. User confirms or overrides the final version
    6. Stamp CHANGELOG: that heading -> [version] - today

    Steps 3-6 are skipped when the user chooses to publish an
    already-released version as-is (e.g. to sync to Open VSX).
    """
    pkg_version = read_package_version()
    if pkg_version == "unknown":
        fail("Could not read version from package.json")
        return pkg_version, False

    # When version <= CHANGELOG max: infer intent from git. Already tagged -> re-publish (as-is) or bump.
    max_cl = _get_changelog_max_version()
    if max_cl and _parse_semver(pkg_version) <= _parse_semver(max_cl):
        next_ver = _bump_patch(max_cl)
        if _is_version_tagged(pkg_version):
            warn(f"{TAG_PREFIX}{pkg_version} is already released (tag exists).")
            # Changelog still has [Unreleased]/[Unpublished]/[Undefined] -> offer bump first (no "publish as-is?").
            if _changelog_has_unpublished_heading():
                pkg_version, bump_ok = _offer_bump_and_apply(
                    pkg_version, next_ver, "Version already tagged; bump to release changelog."
                )
                if not bump_ok:
                    return pkg_version, False
            else:
                if ask_yn(f"Publish v{pkg_version} as-is (e.g. sync to Open VSX)?", default=True):
                    ok(f"Publishing v{pkg_version} as-is")
                    return pkg_version, True
                pkg_version, bump_ok = _offer_bump_and_apply(
                    pkg_version, next_ver, f"Set package.json version higher than {max_cl}"
                )
                if not bump_ok:
                    return pkg_version, False
        else:
            warn(f"package.json v{pkg_version} <= CHANGELOG max v{max_cl}")
            pkg_version, bump_ok = _offer_bump_and_apply(
                pkg_version, next_ver, f"Set package.json version higher than {max_cl}"
            )
            if not bump_ok:
                if not ask_yn(f"Publish v{pkg_version} as-is (no CHANGELOG stamp)?", default=False):
                    fail(f"Set package.json version higher than {max_cl}")
                    return pkg_version, False
                ok(f"Publishing v{pkg_version} as-is")
                return pkg_version, True

    if not _has_unreleased_section():
        if not _ensure_unreleased_section():
            return pkg_version, False

    version, tag_ok = _ensure_untagged_version(pkg_version)
    if not tag_ok:
        return version, False

    # Let the user confirm or override the version (skip if PUBLISH_YES / --yes)
    if os.environ.get("PUBLISH_YES"):
        confirmed = version
    else:
        confirmed = _ask_version(version)
    if confirmed is None:
        fail("Version not confirmed. Press Y or Enter to confirm, or run with --yes.")
        return version, False
    if confirmed != version:
        # User overrode -- re-check tag availability
        if _is_version_tagged(confirmed):
            fail(f"Tag '{TAG_PREFIX}{confirmed}' already exists.")
            return confirmed, False
        if not _write_package_version(confirmed):
            return confirmed, False
        fix(f"package.json: {version} -> {C.WHITE}{confirmed}{C.RESET}")
        version = confirmed

    if not _stamp_changelog(version):
        return version, False

    ok(f"Version {C.WHITE}{version}{C.RESET} validated")
    return version, True
