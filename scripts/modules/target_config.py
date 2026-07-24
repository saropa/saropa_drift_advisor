# -*- coding: utf-8 -*-
"""Publish target configuration and version read/write helpers.

This module is the single place for:

* **Target metadata** — ``TargetConfig`` rows for the Dart package (pub.dev) and
  the VS Code extension (Marketplace / Open VSX), including tag prefixes and paths
  staged for release commits.
* **Version I/O** — ``read_version`` / ``write_version`` for ``pubspec.yaml`` and
  ``package.json``, plus changelog-driven helpers such as ``read_max_version``.
* **Derived constant sync** — When the Dart package version changes,
  ``write_version(DART, ...)`` updates ``extension/.../add-package.ts``,
  ``lib/.../server_constants.dart``, and ``doc/API.md`` so embedded semver
  strings stay consistent.

**Server constants vs pubspec:** Developers sometimes bump ``pubspec.yaml`` without
going through ``write_version``. ``ensure_server_constants_version_sync`` (called from
the Dart analysis pipeline in ``modules.pipeline``) compares ``read_version(DART)``
to ``packageVersion`` in ``server_constants.dart`` and, if needed, reuses
``sync_server_constants_version`` to rewrite that constant before ``dart test``. That
keeps ``test/version_sync_test.dart`` green without manual edits and avoids duplicating
regex logic beyond the paired read (``read_server_constants_package_version``) and
write (``sync_server_constants_version``) patterns.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field

from modules.constants import (
    ADD_PACKAGE_TS_PATH,
    API_MD_PATH,
    CHANGELOG_PATH,
    EXTENSION_DIR,
    PACKAGE_JSON_PATH,
    PUBSPEC_PATH,
    REPO_ROOT,
    SERVER_CONSTANTS_PATH,
)
from modules.display import fail, info, ok


@dataclass(frozen=True)
class TargetConfig:
    """Describes one publishable target (Dart package or VS Code extension)."""

    name: str
    display_name: str
    tag_prefix: str
    version_file: str
    work_dir: str
    git_stage_paths: tuple[str, ...] = field(default_factory=tuple)
    commit_msg_fmt: str = "Release {version}"
    # When True, run ``dart format .`` immediately before ``git add`` in the
    # release commit. The husky pre-commit hook runs
    # ``dart format --set-exit-if-changed .`` whenever .dart files are staged
    # and aborts the commit if anything is unformatted. The analysis phase
    # formats early, but on a ``--resume`` run analysis is skipped, and any
    # step (or manual edit) between analysis and commit can re-dirty a file —
    # so formatting at stage time is the only place that guarantees the staged
    # content matches what the hook checks. Dart-only; the extension stages no
    # .dart files so the hook's format gate never fires for it.
    format_before_stage: bool = False

    @property
    def changelog_path(self) -> str:
        """Shared CHANGELOG.md at repo root."""
        return CHANGELOG_PATH


DART = TargetConfig(
    name="dart",
    display_name="Dart Package",
    tag_prefix="v",
    version_file=PUBSPEC_PATH,
    work_dir=REPO_ROOT,
    git_stage_paths=(".",),
    commit_msg_fmt="Release v{version}",
    format_before_stage=True,
)

EXTENSION = TargetConfig(
    name="extension",
    display_name="VS Code Extension",
    tag_prefix="ext-v",
    version_file=PACKAGE_JSON_PATH,
    work_dir=EXTENSION_DIR,
    git_stage_paths=("extension/", "scripts/"),
    commit_msg_fmt="Release ext-v{version}",
)


# ── Version read / write ─────────────────────────────────


_SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")

# packageVersion in server_constants.dart (must match pubspec for version_sync_test).
_SERVER_CONSTANTS_PACKAGE_VERSION_RE = re.compile(
    r"static const String packageVersion = '(\d+\.\d+\.\d+)'",
)


def _parse_semver_tuple(version: str) -> tuple[int, int, int]:
    """Parse a semver string into (major, minor, patch) for comparison."""
    parts = version.split(".")
    return (int(parts[0]), int(parts[1]), int(parts[2])) if len(parts) == 3 else (0, 0, 0)


def _get_changelog_max_version() -> str | None:
    """Return the highest version from ## [x.y.z] headings in CHANGELOG.md."""
    versions: list[str] = []
    try:
        with open(CHANGELOG_PATH, encoding="utf-8") as f:
            for line in f:
                m = re.match(r"^## \[(\d+\.\d+\.\d+)\]", line)
                if m:
                    versions.append(m.group(1))
    except OSError:
        return None
    if not versions:
        return None
    return max(versions, key=_parse_semver_tuple)


def read_max_version() -> str:
    """Return the largest version from pubspec.yaml, package.json, and CHANGELOG.

    Used as the canonical version for the extension so a stale package.json
    does not override pubspec or CHANGELOG. Returns \"unknown\" if no valid
    version is found in any source.
    """
    candidates: list[str] = []
    for config in (DART, EXTENSION):
        v = read_version(config)
        if v != "unknown" and _SEMVER_RE.match(v):
            candidates.append(v)
    cl_max = _get_changelog_max_version()
    if cl_max:
        candidates.append(cl_max)
    if not candidates:
        return "unknown"
    return max(candidates, key=_parse_semver_tuple)


def read_version(config: TargetConfig) -> str:
    """Read the current version from the target's version file.

    Returns "unknown" if the file cannot be read or parsed.
    """
    try:
        with open(config.version_file, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return "unknown"

    if config.name == "dart":
        match = re.search(
            r"^version:\s*(\d+\.\d+\.\d+)", content, re.MULTILINE,
        )
        return match.group(1) if match else "unknown"

    # Extension: package.json
    try:
        data = json.loads(content)
        return data.get("version", "unknown")
    except json.JSONDecodeError:
        return "unknown"


def write_version(config: TargetConfig, version: str) -> bool:
    """Write *version* into the target's version file."""
    filename = os.path.basename(config.version_file)
    try:
        with open(config.version_file, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        fail(f"Could not read {filename}")
        return False

    if config.name == "dart":
        pattern = r"^(version:\s*)\d+\.\d+\.\d+"
        replacement = rf"\g<1>{version}"
        updated, count = re.subn(pattern, replacement, content, count=1, flags=re.MULTILINE)
    else:
        pattern = r'("version"\s*:\s*")([^"]+)(")'
        replacement = rf"\g<1>{version}\3"
        updated, count = re.subn(pattern, replacement, content, count=1)
    if count == 0:
        fail(f"Could not find 'version' in {filename}")
        return False

    try:
        with open(config.version_file, "w", encoding="utf-8") as f:
            f.write(updated)
    except OSError:
        fail(f"Could not write {filename}")
        return False

    # When the Dart package version changes, also update dependent constants
    # so the extension install button and web UI stay in sync.
    if config.name == "dart":
        sync_add_package_version(version)
        sync_server_constants_version(version)
        sync_api_md_version(version)

    return True


def sync_add_package_version(version: str) -> bool:
    """Update the PACKAGE_VERSION constant in add-package.ts to '^{version}'.

    This keeps the "Add Saropa Drift Advisor" button in sync with the
    published Dart package version so users get the correct constraint.
    """
    try:
        with open(ADD_PACKAGE_TS_PATH, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        fail(f"Could not read {os.path.basename(ADD_PACKAGE_TS_PATH)}")
        return False

    # Match the PACKAGE_VERSION constant: const PACKAGE_VERSION = '^x.y.z';
    pattern = r"(const PACKAGE_VERSION\s*=\s*'\^)\d+\.\d+\.\d+(')"
    replacement = rf"\g<1>{version}\2"
    updated, count = re.subn(pattern, replacement, content, count=1)
    if count == 0:
        fail(f"Could not find PACKAGE_VERSION in {os.path.basename(ADD_PACKAGE_TS_PATH)}")
        return False

    try:
        with open(ADD_PACKAGE_TS_PATH, "w", encoding="utf-8") as f:
            f.write(updated)
    except OSError:
        fail(f"Could not write {os.path.basename(ADD_PACKAGE_TS_PATH)}")
        return False
    return True


def read_server_constants_package_version() -> str | None:
    """Return the semver in packageVersion from server_constants.dart, or None."""
    try:
        with open(SERVER_CONSTANTS_PATH, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        return None
    m = _SERVER_CONSTANTS_PACKAGE_VERSION_RE.search(content)
    return m.group(1) if m else None


def ensure_server_constants_version_sync() -> bool:
    """Ensure server_constants packageVersion matches pubspec.yaml.

    Manual pubspec bumps bypass write_version(), which would normally call
    sync_server_constants_version(). The analyze pipeline runs this before
    Dart tests so version_sync_test passes without a manual edit.
    """
    pub_ver = read_version(DART)
    if not _SEMVER_RE.match(pub_ver):
        fail(f"Invalid or unreadable pubspec version: {pub_ver!r}")
        return False

    current = read_server_constants_package_version()
    if current is None:
        fail("Could not parse packageVersion from server_constants.dart")
        return False

    if current == pub_ver:
        ok(f"Server constants packageVersion matches pubspec ({pub_ver})")
        return True

    info(
        f"server_constants.dart ({current}) out of sync with pubspec ({pub_ver}); updating."
    )
    if not sync_server_constants_version(pub_ver):
        return False
    ok(f"Updated server_constants.dart packageVersion to {pub_ver}")
    return True


def sync_server_constants_version(version: str) -> bool:
    """Update the packageVersion constant in server_constants.dart.

    This keeps the web UI health endpoint and CDN CSS URL in sync with
    the published Dart package version so the correct enhanced styles
    load from jsDelivr.
    """
    try:
        with open(SERVER_CONSTANTS_PATH, encoding="utf-8") as f:
            content = f.read()
    except OSError:
        fail(f"Could not read {os.path.basename(SERVER_CONSTANTS_PATH)}")
        return False

    # Match the packageVersion constant: static const String packageVersion = 'x.y.z';
    pattern = r"(static const String packageVersion = ')\d+\.\d+\.\d+(')"
    replacement = rf"\g<1>{version}\2"
    updated, count = re.subn(pattern, replacement, content, count=1)
    if count == 0:
        fail(f"Could not find packageVersion in {os.path.basename(SERVER_CONSTANTS_PATH)}")
        return False

    try:
        with open(SERVER_CONSTANTS_PATH, "w", encoding="utf-8") as f:
            f.write(updated)
    except OSError:
        fail(f"Could not write {os.path.basename(SERVER_CONSTANTS_PATH)}")
        return False
    return True


def _api_md_version_patterns(old: str) -> list[tuple[str, str]]:
    """Build replacement patterns that match the *current* version only.

    Each tuple is (regex, replacement-template with ``{v}`` placeholder).
    Matching a concrete old version instead of ``\\d+\\.\\d+\\.\\d+``
    prevents false hits on unrelated semver text (example payloads,
    dependency versions) and IP addresses.
    """
    esc = re.escape(old)
    return [
        # **API version:** X.Y.Z
        (rf"(\*\*API version:\*\*\s*){esc}", r"\g<1>{v}"),
        # "version": "X.Y.Z"  — standalone JSON field only (line starts
        # with whitespace + key).  Nested objects like
        # "producer": { ..., "version": "3.7.3" } never match.
        (rf'^(\s*"version"\s*:\s*"){esc}(")', r"\g<1>{v}\2"),
        # @vX.Y.Z in jsDelivr CDN URLs (anchored to jsdelivr.net host)
        (rf"(cdn\.jsdelivr\.net/[^@]*@v){esc}", r"\g<1>{v}"),
    ]


def _read_api_md_content() -> str | None:
    """Return the full text of doc/API.md, or None on read error."""
    try:
        with open(API_MD_PATH, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return None


def _read_api_md_header_version(content: str | None = None) -> str | None:
    """Return the semver from the **API version:** header, or None."""
    if content is None:
        content = _read_api_md_content()
    if content is None:
        return None
    m = re.search(r"\*\*API version:\*\*\s*(\d+\.\d+\.\d+)", content)
    return m.group(1) if m else None


def _apply_api_md_replacements(content: str, old: str, new: str) -> str:
    """Return *content* with old→new version applied to known patterns."""
    updated = content
    for pattern, replacement in _api_md_version_patterns(old):
        updated = re.sub(
            pattern, replacement.format(v=new), updated, flags=re.MULTILINE,
        )
    return updated


def sync_api_md_version(
    version: str, *, dry_run: bool = False,
) -> bool | dict[str, object]:
    """Update package-version references in doc/API.md.

    Reads the current header version and replaces only that exact semver
    in three specific contexts: the **API version:** header, standalone
    JSON ``"version"`` fields, and the jsDelivr ``@vX.Y.Z`` CDN tag.
    Unrelated semver text (example payloads, dependency versions, IP
    addresses) is never touched.

    When *dry_run* is True, returns a dict
    ``{"changed": bool, "old": str, "new": str, "diff_count": int}``
    without writing.  Returns False on error, True on success (write
    mode only).
    """
    content = _read_api_md_content()
    if content is None:
        fail(f"Could not read {os.path.basename(API_MD_PATH)}")
        return {"changed": False, "error": "unreadable"} if dry_run else False

    current = _read_api_md_header_version(content)
    if current is None:
        fail("Could not parse **API version:** header from doc/API.md")
        return {"changed": False, "error": "unparseable"} if dry_run else False

    if current == version:
        if not dry_run:
            ok(f"doc/API.md already at {version}")
        return {"changed": False, "old": current, "new": version, "diff_count": 0} if dry_run else True

    updated = _apply_api_md_replacements(content, current, version)
    diff_count = sum(
        1 for a, b in zip(content.splitlines(), updated.splitlines()) if a != b
    )

    if dry_run:
        return {
            "changed": True,
            "old": current,
            "new": version,
            "diff_count": diff_count,
        }

    try:
        with open(API_MD_PATH, "w", encoding="utf-8") as f:
            f.write(updated)
    except OSError:
        fail(f"Could not write {os.path.basename(API_MD_PATH)}")
        return False
    return True


def ensure_api_md_version_sync(*, dry_run: bool = False) -> bool:
    """Ensure doc/API.md version header matches pubspec.yaml.

    Mirrors ensure_server_constants_version_sync — catches manual bumps
    that bypass write_version().

    When *dry_run* is True, reports drift without writing.
    """
    pub_ver = read_version(DART)
    if not _SEMVER_RE.match(pub_ver):
        fail(f"Invalid or unreadable pubspec version: {pub_ver!r}")
        return False

    current = _read_api_md_header_version()
    if current is None:
        fail("Could not parse **API version:** header from doc/API.md")
        return False

    if current == pub_ver:
        ok(f"doc/API.md version matches pubspec ({pub_ver})")
        return True

    if dry_run:
        info(
            f"doc/API.md ({current}) out of sync with pubspec ({pub_ver}); "
            f"would update (dry-run)."
        )
        return False

    info(
        f"doc/API.md ({current}) out of sync with pubspec ({pub_ver}); updating."
    )
    if not sync_api_md_version(pub_ver):
        return False
    ok(f"Updated doc/API.md version to {pub_ver}")
    return True


def sync_versions(version: str) -> bool:
    """Write *version* to pubspec.yaml, package.json, and dependent constants.

    Note: write_version(DART, ...) already calls sync_add_package_version()
    and sync_server_constants_version() internally, so add-package.ts and
    server_constants.dart are updated as side-effects of the Dart write.
    """
    ok_dart = write_version(DART, version)
    ok_ext = write_version(EXTENSION, version)
    return ok_dart and ok_ext
