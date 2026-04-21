# -*- coding: utf-8 -*-
"""Extension marketplace publish operations."""

import glob
import json
import os
import subprocess

from modules.constants import (
    C,
    MARKETPLACE_EXTENSION_ID,
    MARKETPLACE_URL,
    EXTENSION_DIR,
    REPO_URL,
    TAG_PREFIX,
)
from modules.display import ask_yn, fail, heading, info, ok, print_cmd_output, warn
from modules.ext_prereqs import get_ovsx_pat
from modules.utils import run, run_step


def confirm_publish(version: str) -> bool:
    """Show publish summary and require explicit confirmation."""
    tag = f"{TAG_PREFIX}{version}"
    print(f"\n  {C.BOLD}{C.YELLOW}Publish Summary{C.RESET}")
    print(f"  {'-' * 40}")
    print(f"  Version:     {C.WHITE}v{version}{C.RESET}")
    print(f"  Tag:         {C.WHITE}{tag}{C.RESET}")
    print(f"  Marketplace: {C.WHITE}{MARKETPLACE_EXTENSION_ID}{C.RESET}")
    print(f"  Repository:  {C.WHITE}{REPO_URL}{C.RESET}")
    print(f"\n  {C.YELLOW}This will:{C.RESET}")
    print(f"    1. Commit and push to origin")
    print(f"    2. Create git tag {tag}")
    print(f"    3. Publish to VS Code Marketplace")
    print(f"    4. Publish to Open VSX (Cursor / VSCodium, if OVSX_PAT set)")
    print(f"    5. Create GitHub release with .vsix")
    print(f"\n  {C.RED}These actions are irreversible.{C.RESET}")
    return ask_yn("Proceed with publish?", default=False)


def step_package() -> str | None:
    """Package the extension into a .vsix file. Returns the file path.

    After packaging, inspects the VSIX (which is a zip archive) to
    verify that the critical entry-point ``extension/out/extension.js``
    is actually present inside the archive.  This catches cases where
    the compiled output was missing or ``.vscodeignore`` accidentally
    excluded the ``out/`` directory.
    """
    info("Packaging .vsix file...")
    result = run(
        ["npx", "@vscode/vsce", "package", "--no-dependencies"],
        cwd=EXTENSION_DIR,
    )
    if result.returncode != 0:
        fail("Packaging failed:")
        print_cmd_output(result)
        return None

    pattern = os.path.join(EXTENSION_DIR, "*.vsix")
    vsix_files = sorted(glob.glob(pattern), key=os.path.getmtime)
    if not vsix_files:
        fail("No .vsix file found after packaging.")
        return None

    vsix_path = vsix_files[-1]
    size_kb = os.path.getsize(vsix_path) / 1024

    # Verify the VSIX actually contains the compiled entry point.
    # A VSIX is a zip; the main field in package.json points to
    # ./out/extension.js which appears as extension/out/extension.js
    # inside the archive.
    if not _verify_vsix_contents(vsix_path):
        return None

    ok(f"Created: {os.path.basename(vsix_path)} ({size_kb:.0f} KB)")
    return vsix_path


# Files that MUST be present inside the VSIX for the extension to
# function.  Paths are relative to the archive root (vsce prefixes
# files with "extension/").
_REQUIRED_VSIX_FILES = [
    "extension/out/extension.js",
    "extension/package.json",
]


def _verify_vsix_contents(vsix_path: str) -> bool:
    """Open the VSIX as a zip and confirm required files are present."""
    import zipfile

    try:
        with zipfile.ZipFile(vsix_path, "r") as zf:
            names = set(zf.namelist())
            missing = [f for f in _REQUIRED_VSIX_FILES if f not in names]
    except (zipfile.BadZipFile, OSError) as exc:
        fail(f"Cannot read VSIX archive: {exc}")
        return False

    if missing:
        fail("VSIX is missing critical files:")
        for m in missing:
            info(f"  {C.RED}✗{C.RESET} {m}")
        fail(
            "The extension will silently fail to activate without these. "
            "Check .vscodeignore and ensure 'npm run compile' succeeded."
        )
        return False

    ok("VSIX contents verified (entry point + package.json present)")
    return True


def get_marketplace_published_version() -> str | None:
    """Return the latest version published on VS Code Marketplace."""
    result = run(
        ["npx", "@vscode/vsce", "show", MARKETPLACE_EXTENSION_ID, "--json"],
        cwd=EXTENSION_DIR,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    try:
        data = json.loads(result.stdout)
        versions = data.get("versions")
        if versions and isinstance(versions, list) and len(versions) > 0:
            first = versions[0]
            if isinstance(first, dict) and "version" in first:
                return str(first["version"]).strip()
    except (json.JSONDecodeError, TypeError):
        pass
    return None


## Maximum seconds to wait for a marketplace publish command before giving up.
_PUBLISH_TIMEOUT_SECS = 300


def publish_marketplace(vsix_path: str) -> bool:
    """Publish the pre-built .vsix to VS Code Marketplace."""
    info(f"Publishing {os.path.basename(vsix_path)} to marketplace...")
    try:
        result = run(
            ["npx", "@vscode/vsce", "publish", "--packagePath", vsix_path],
            cwd=EXTENSION_DIR,
            timeout=_PUBLISH_TIMEOUT_SECS,
        )
    except subprocess.TimeoutExpired:
        fail(
            f"Marketplace publish timed out after {_PUBLISH_TIMEOUT_SECS}s. "
            "The server may be unresponsive — try again later."
        )
        return False
    if result.returncode != 0:
        fail("Marketplace publish failed:")
        print_cmd_output(result)
        return False
    ok("Published to VS Code Marketplace")
    return True


def publish_openvsx(vsix_path: str) -> bool:
    """Publish the pre-built .vsix to Open VSX."""
    pat = get_ovsx_pat()
    if not pat:
        fail("OVSX_PAT is not set.")
        return False
    info(f"Publishing {os.path.basename(vsix_path)} to Open VSX...")
    try:
        result = run(
            ["npx", "ovsx", "publish", vsix_path, "-p", pat],
            cwd=EXTENSION_DIR,
            timeout=_PUBLISH_TIMEOUT_SECS,
        )
    except subprocess.TimeoutExpired:
        fail(
            f"Open VSX publish timed out after {_PUBLISH_TIMEOUT_SECS}s. "
            "The server may be unresponsive — try again later."
        )
        return False
    if result.returncode != 0:
        fail("Open VSX publish failed:")
        print_cmd_output(result)
        return False
    ok("Published to Open VSX")
    return True


# ── Publish Orchestration ────────────────────────────────


def ask_publish_stores() -> str:
    """Ask which store(s) to publish to. Returns 'vscode_only', 'openvsx_only', or 'both'."""
    print(f"\n  {C.YELLOW}Which store(s) to publish to?{C.RESET}")
    print("    1 = VS Code Marketplace only")
    print("    2 = Open VSX only (Cursor / VSCodium)")
    print("    3 = both")
    try:
        raw = input(f"  {C.YELLOW}Choice [3]: {C.RESET}").strip() or "3"
    except (EOFError, KeyboardInterrupt):
        print()
        return "both"
    if raw == "1":
        return "vscode_only"
    if raw == "2":
        return "openvsx_only"
    return "both"


def _check_publish_credentials(
    results: list[tuple[str, bool, float]],
    stores: str = "both",
) -> bool:
    """Verify credentials for chosen store(s)."""
    from modules.checks_git import check_gh_cli
    from modules.ext_prereqs import check_vsce_auth, check_ovsx_token

    heading("Publish Credentials")
    if not run_step("GitHub CLI", check_gh_cli, results):
        return False
    if stores in ("both", "vscode_only"):
        if not run_step("vsce PAT", check_vsce_auth, results):
            return False
    else:
        info("Skipping vsce PAT (publish to Open VSX only).")
    if stores in ("both", "openvsx_only"):
        run_step("OVSX PAT", check_ovsx_token, results)
    else:
        info("Skipping OVSX PAT (publish to VS Code Marketplace only).")
    return True


def _save_ovsx_pat_to_env(pat: str) -> None:
    """Append OVSX_PAT to .env so it persists across runs."""
    from modules.constants import REPO_ROOT
    from modules.display import fix as fix_msg, info as info_msg
    env_path = os.path.join(REPO_ROOT, ".env")
    try:
        existing = ""
        if os.path.exists(env_path):
            with open(env_path, encoding="utf-8") as f:
                existing = f.read()
        if "OVSX_PAT=" in existing:
            return  # already present
        with open(env_path, "a", encoding="utf-8") as f:
            if existing and not existing.endswith("\n"):
                f.write("\n")
            f.write(f"OVSX_PAT={pat}\n")
        fix_msg(f"Saved OVSX_PAT to {C.WHITE}.env{C.RESET} (won't ask again)")
    except OSError:
        info_msg("Could not save to .env — you'll be prompted again next time.")


def _publish_openvsx_step(
    vsix_path: str,
    results: list[tuple[str, bool, float]],
) -> None:
    """Publish to Open VSX, prompting for token if not already set."""
    pat = get_ovsx_pat()
    if not pat:
        try:
            import getpass
            info(f"Token page: {C.WHITE}https://open-vsx.org/user-settings/tokens{C.RESET}")
            pat = (getpass.getpass(
                prompt="  Paste Open VSX token or Enter to skip: ",
            ) or "").strip()
            if pat:
                os.environ["OVSX_PAT"] = pat
                _save_ovsx_pat_to_env(pat)
        except (EOFError, KeyboardInterrupt):
            pat = ""
        if not pat:
            info("No token; skipping Open VSX.")
            return
    openvsx_ok = run_step("Open VSX publish",
                          lambda: publish_openvsx(vsix_path), results)
    if not openvsx_ok:
        warn("Open VSX publish failed; continuing to GitHub release.")


def _run_publish_steps(
    version: str,
    vsix_path: str,
    results: list[tuple[str, bool, float]],
    stores: str = "both",
) -> bool:
    """Commit, tag, and publish extension. Returns True on success."""
    from modules.github_release import create_github_release
    from modules.pipeline import _commit_and_tag
    from modules.target_config import EXTENSION

    if not _commit_and_tag(EXTENSION, version, results, "Step 11-12 \u00b7"):
        return False

    heading("Step 13 \u00b7 Publish to Marketplace")
    if stores == "openvsx_only":
        info("Skipping (publish to Open VSX only).")
    else:
        published = get_marketplace_published_version()
        if published == version:
            info(f"VS Code Marketplace already has v{version}; skipping.")
        elif not run_step("Marketplace publish",
                          lambda: publish_marketplace(vsix_path), results):
            return False

    heading("Step 14 \u00b7 Publish to Open VSX")
    if stores == "vscode_only":
        info("Skipping (publish to VS Code Marketplace only).")
    else:
        _publish_openvsx_step(vsix_path, results)

    heading("Step 15 \u00b7 GitHub Release")
    if not run_step("GitHub release",
                    lambda: create_github_release(EXTENSION, version, asset_path=vsix_path),
                    results):
        warn("GitHub release failed. Create manually: "
             f"gh release create ext-v{version}")

    return True


def _determine_stores() -> str:
    """Decide which store(s) to publish to based on local installs."""
    from modules.ext_prereqs import get_installed_extension_versions

    if get_installed_extension_versions():
        return "both"
    return ask_publish_stores()


def run_ext_publish(
    version: str,
    vsix_path: str,
    results: list[tuple[str, bool, float]],
) -> bool:
    """Run extension publish steps (11-16). Returns True on success."""
    from modules.report import (
        save_report, print_timing, print_success_banner, print_report_path,
    )
    from modules.target_config import EXTENSION

    stores = _determine_stores()
    if not _check_publish_credentials(results, stores):
        return False
    if not _run_publish_steps(version, vsix_path, results, stores=stores):
        return False

    # Step 16: poll registry APIs until the new version is live.  This
    # catches CDN propagation delays so we don't close the terminal
    # thinking the release is done when users still see the old version.
    heading("Step 16 · Verify store propagation")
    from modules.store_propagation import run_store_propagation_wait
    from modules.utils import run_step
    # Pass vsix_path so that if the Marketplace check times out, the
    # follow-up warning can point the user directly at the file they
    # need to drag onto the publisher management page.
    propagation_ok = run_step(
        "Store propagation",
        lambda: run_store_propagation_wait(
            version, stores, target="extension", vsix_path=vsix_path,
        ) == 0,
        results,
    )
    if not propagation_ok:
        # Propagation timeout is non-fatal — the publish CLI itself
        # succeeded, but the store may not have indexed the new version.
        # Targeted per-store guidance (including the Marketplace
        # publisher URL for manual upload) was already emitted inside
        # run_store_propagation_wait; just note here that we're not
        # aborting so the rest of the report still prints.
        warn(
            "Store propagation check did not confirm all stores; "
            "see the per-store guidance above to finish manually."
        )

    report = save_report(results, version, vsix_path, is_publish=True, config=EXTENSION)
    print_timing(results)
    print_success_banner(version, vsix_path)
    print_report_path(report)
    return True
