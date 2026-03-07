# -*- coding: utf-8 -*-
"""Shell execution, version reading, and timing helpers."""

import json
import os
import shutil
import subprocess
import sys
import time

from modules.constants import MARKETPLACE_EXTENSION_ID, REPO_ROOT, EXTENSION_DIR, TAG_PREFIX


def run(cmd: list[str], **kwargs) -> subprocess.CompletedProcess[str]:
    """Run a shell command and return the result.

    shell=True is needed on Windows so that npm/npx/.cmd scripts resolve
    via PATH through cmd.exe. On macOS/Linux, shell=False is safer and
    avoids quoting issues.
    """
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        # Explicit UTF-8 avoids Windows defaulting to cp1252,
        # which garbles Unicode output.
        encoding="utf-8",
        errors="replace",
        # Windows needs shell=True because npm/npx are .cmd batch files
        # that only resolve through cmd.exe's PATH lookup.
        shell=(sys.platform == "win32"),
        **kwargs,
    )


def get_ovsx_pat() -> str:
    """Return OVSX_PAT from environment or from project .env file.

    So the token works when the script is run from the IDE (no shell env).
    .env is in .gitignore; use one line: OVSX_PAT=your-token
    """
    pat = os.environ.get("OVSX_PAT", "").strip()
    if pat:
        return pat
    env_path = os.path.join(REPO_ROOT, ".env")
    try:
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("OVSX_PAT="):
                    value = line.split("=", 1)[1].strip().strip('"').strip("'")
                    return value
    except OSError:
        pass
    return ""


def get_installed_extension_versions(
    extension_id: str = MARKETPLACE_EXTENSION_ID,
) -> dict[str, str]:
    """Return installed version per editor: {"vscode": "2.0.15", "cursor": "2.0.14"}.

    Checks `code` and `cursor` CLI (--list-extensions --show-versions).
    Only includes editors where the extension is installed. Empty dict = not installed.
    """
    out: dict[str, str] = {}
    for editor in ("code", "cursor"):
        if not shutil.which(editor):
            continue
        result = run(
            [editor, "--list-extensions", "--show-versions"],
            check=False,
        )
        if result.returncode != 0:
            continue
        prefix = f"{extension_id.lower()}@"
        for line in result.stdout.strip().splitlines():
            line = line.strip().lower()
            if line.startswith(prefix):
                version = line[len(prefix) :].strip()
                if version:
                    out[editor] = version
                break
    return out


def read_package_version() -> str:
    """Read the extension version from package.json.

    Returns "unknown" if the file can't be read or parsed, so callers
    can still display a banner before failing more specifically.
    """
    pkg_path = os.path.join(EXTENSION_DIR, "package.json")
    try:
        with open(pkg_path, encoding="utf-8") as f:
            data = json.load(f)
        return data.get("version", "unknown")
    except (OSError, json.JSONDecodeError):
        return "unknown"


def elapsed_str(seconds: float) -> str:
    """Format elapsed seconds as a human-readable string.

    Sub-second durations are shown in milliseconds for readability.
    """
    if seconds < 1:
        return f"{seconds * 1000:.0f}ms"
    return f"{seconds:.1f}s"


def run_step(
    name: str,
    fn: object,
    results: list[tuple[str, bool, float]],
) -> bool:
    """Time and record a single pipeline step.

    Wraps any step function with timing. The (name, passed, elapsed) tuple
    is appended to the results list for the timing chart and report.
    """
    t0 = time.time()
    passed = fn()  # type: ignore[operator]
    elapsed = time.time() - t0
    results.append((name, passed, elapsed))
    return passed


def is_version_tagged(version: str) -> bool:
    """Check whether a git tag (ext-v{version}) already exists."""
    tag = f"{TAG_PREFIX}{version}"
    result = run(["git", "tag", "-l", tag], cwd=REPO_ROOT)
    return bool(result.stdout.strip())
