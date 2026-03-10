# -*- coding: utf-8 -*-
"""Shell execution and timing helpers."""

import shutil
import subprocess
import sys
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Callable


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
        encoding="utf-8",
        errors="replace",
        shell=(sys.platform == "win32"),
        **kwargs,
    )


def elapsed_str(seconds: float) -> str:
    """Format elapsed seconds as a human-readable string."""
    if seconds < 1:
        return f"{seconds * 1000:.0f}ms"
    return f"{seconds:.1f}s"


def run_step(
    name: str,
    fn: "Callable[[], bool]",
    results: list[tuple[str, bool, float]],
) -> bool:
    """Time and record a single pipeline step."""
    t0 = time.time()
    passed = fn()
    elapsed = time.time() - t0
    results.append((name, passed, elapsed))
    return passed


def command_exists(cmd: str) -> bool:
    """Return True if *cmd* is found on PATH."""
    return shutil.which(cmd) is not None
