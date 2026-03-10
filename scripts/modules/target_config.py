# -*- coding: utf-8 -*-
"""Publish target configuration and version read/write helpers."""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field

from modules.constants import (
    CHANGELOG_PATH,
    EXTENSION_DIR,
    PACKAGE_JSON_PATH,
    PUBSPEC_PATH,
    REPO_ROOT,
)
from modules.display import fail


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
    return True


def sync_versions(version: str) -> bool:
    """Write *version* to both pubspec.yaml and package.json."""
    ok_dart = write_version(DART, version)
    ok_ext = write_version(EXTENSION, version)
    return ok_dart and ok_ext
