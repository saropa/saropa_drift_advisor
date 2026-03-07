# -*- coding: utf-8 -*-
"""Local .vsix install workflow for --analyze-only mode.

Shows installation instructions, offers CLI install, and can
open the build report with the platform-appropriate file opener.
"""

import os
import shutil
import subprocess
import sys

from modules.constants import C
from modules.display import ask_yn, fail, heading, info, ok, warn
from modules.utils import run


def print_install_instructions(vsix_path: str) -> None:
    """Print coloured instructions for installing the .vsix in VS Code.

    Shows three installation methods (Command Palette, CLI, drag-and-drop)
    and a quick-start guide for the extension after installing.
    """
    vsix_name = os.path.basename(vsix_path)
    abs_path = os.path.abspath(vsix_path)

    heading("Install Instructions")

    opt = f"{C.BOLD}{C.CYAN}"
    key = f"{C.YELLOW}"
    rst = C.RESET

    print(f"""
  {opt}Option 1 -- Command Palette (recommended):{rst}

    1. Open VS Code
    2. Press  {key}Ctrl+Shift+P{rst}  (macOS: {key}Cmd+Shift+P{rst})
    3. Type:  {key}Extensions: Install from VSIX...{rst}
    4. Browse to:
       {C.WHITE}{abs_path}{rst}
    5. Click {key}"Install"{rst}
    6. Reload VS Code when prompted

  {opt}Option 2 -- Command line:{rst}

    {C.WHITE}code --install-extension {vsix_name}{rst}

  {opt}Option 3 -- Drag and drop:{rst}

    1. Open VS Code
    2. Open the Extensions sidebar  ({key}Ctrl+Shift+X{rst})
    3. Drag the .vsix file into the Extensions sidebar

  {opt}After installing:{rst}

    - Press {key}Ctrl+Shift+P{rst} and type {key}"Drift Viewer"{rst} to see all commands
    - Use {key}"Drift Viewer: Open in Browser"{rst} to open the debug viewer
    - Use {key}"Drift Viewer: Open in Editor Panel"{rst} for an embedded panel
""")


def prompt_install(vsix_path: str) -> None:
    """Ask the user whether to install the .vsix via the code CLI.

    Falls back gracefully if the 'code' CLI isn't on PATH.
    """
    if not shutil.which("code"):
        warn("VS Code CLI (code) not found on PATH -- cannot auto-install.")
        info("Add it via: VS Code > Ctrl+Shift+P > "
             "'Shell Command: Install code command in PATH'")
        return

    if not ask_yn("Install via CLI now?", default=False):
        return

    vsix_name = os.path.basename(vsix_path)
    info(f"Running: code --install-extension {vsix_name}")
    result = run(
        ["code", "--install-extension", os.path.abspath(vsix_path)],
    )
    if result.returncode != 0:
        fail(f"Install failed: {result.stderr.strip()}")
        return
    ok("Extension installed successfully!")
    info("Reload VS Code to activate the updated extension.")


def prompt_open_report(report_path: str) -> None:
    """Ask the user whether to open the build report.

    Uses the platform-appropriate file opener (startfile on Windows,
    open on macOS, xdg-open on Linux).
    """
    if not ask_yn("Open build report?", default=False):
        return

    # cspell:ignore startfile
    abs_path = os.path.abspath(report_path)
    if sys.platform == "win32":
        os.startfile(abs_path)  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.Popen(["open", abs_path])
    else:
        subprocess.Popen(["xdg-open", abs_path])
