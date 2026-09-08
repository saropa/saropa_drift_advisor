# -*- coding: utf-8 -*-
"""Unit tests for modules.ext_build's engines.vscode / @types/vscode compat gate.

Points the module's EXTENSION_DIR at a temp directory holding a synthetic
package.json, so the mismatch detection and the auto-fix rewrite are
exercised without touching the real extension/package.json. The npm install
subprocess is mocked out -- these tests verify the JSON rewrite and the
pass/fail logic, not real npm behavior.
"""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules import ext_build


def _write_pkg(ext_dir: Path, engines_vscode: str, types_vscode: str) -> None:
    """Write a minimal package.json with the given engines/@types/vscode specs."""
    pkg = {
        "name": "test-ext",
        "engines": {"vscode": engines_vscode},
        "devDependencies": {"@types/vscode": types_vscode},
    }
    ext_dir.mkdir(parents=True, exist_ok=True)
    (ext_dir / "package.json").write_text(
        json.dumps(pkg, indent=2) + "\n", encoding="utf-8"
    )


class TestCheckEnginesVscodeCompat(unittest.TestCase):
    """Branch coverage for check_engines_vscode_compat."""

    def _run_check(self, engines_vscode: str, types_vscode: str) -> bool:
        with TemporaryDirectory() as tmp:
            ext = Path(tmp) / "ext"
            _write_pkg(ext, engines_vscode, types_vscode)
            with patch.object(ext_build, "EXTENSION_DIR", str(ext)):
                return ext_build.check_engines_vscode_compat()

    def test_types_at_engines_floor_passes(self) -> None:
        self.assertTrue(self._run_check("^1.134.0", "^1.134.0"))

    def test_types_below_engines_floor_passes(self) -> None:
        self.assertTrue(self._run_check("^1.134.0", "^1.130.0"))

    def test_types_above_engines_floor_fails(self) -> None:
        self.assertFalse(self._run_check("^1.134.0", "^1.136.0"))

    def test_missing_engines_field_skips_as_pass(self) -> None:
        with TemporaryDirectory() as tmp:
            ext = Path(tmp) / "ext"
            ext.mkdir(parents=True)
            (ext / "package.json").write_text(
                json.dumps({"name": "x", "devDependencies": {"@types/vscode": "^1.136.0"}}),
                encoding="utf-8",
            )
            with patch.object(ext_build, "EXTENSION_DIR", str(ext)):
                self.assertTrue(ext_build.check_engines_vscode_compat())

    def test_unparseable_range_skips_as_pass(self) -> None:
        self.assertTrue(self._run_check("*", "*"))


class TestFixEnginesVscodeCompat(unittest.TestCase):
    """Branch coverage for fix_engines_vscode_compat's pin-and-reinstall flow."""

    def _run_fix(self, engines_vscode: str, types_vscode: str, *, install_ok: bool = True):
        """Run the auto-fix against a synthetic package.json with npm install mocked out."""
        with TemporaryDirectory() as tmp:
            ext = Path(tmp) / "ext"
            _write_pkg(ext, engines_vscode, types_vscode)
            fake_result = SimpleNamespace(
                returncode=0 if install_ok else 1, stderr="" if install_ok else "boom"
            )
            with patch.object(ext_build, "EXTENSION_DIR", str(ext)), \
                    patch.object(ext_build, "run", return_value=fake_result) as mock_run:
                result = ext_build.fix_engines_vscode_compat()
                pkg_after = json.loads((ext / "package.json").read_text(encoding="utf-8"))
        return result, mock_run, pkg_after

    def test_pins_types_to_engines_floor(self) -> None:
        result, mock_run, pkg_after = self._run_fix("^1.134.0", "^1.136.0")
        self.assertTrue(result)
        self.assertEqual(pkg_after["devDependencies"]["@types/vscode"], "^1.134.0")
        # Other fields (name, engines) must survive the raw-text rewrite untouched.
        self.assertEqual(pkg_after["name"], "test-ext")
        self.assertEqual(pkg_after["engines"]["vscode"], "^1.134.0")

    def test_reinstall_is_scoped_to_the_one_package(self) -> None:
        _, mock_run, _ = self._run_fix("^1.134.0", "^1.136.0")
        mock_run.assert_called_once()
        cmd = mock_run.call_args[0][0]
        self.assertEqual(cmd[:2], ["npm", "install"])
        self.assertIn("@types/vscode@^1.134.0", cmd)

    def test_install_failure_returns_false(self) -> None:
        result, _, pkg_after = self._run_fix("^1.134.0", "^1.136.0", install_ok=False)
        self.assertFalse(result)
        # The pin is still written even though the reinstall failed -- the
        # manifest and lockfile are now out of sync until the operator retries.
        self.assertEqual(pkg_after["devDependencies"]["@types/vscode"], "^1.134.0")

    def test_missing_types_field_cannot_autofix(self) -> None:
        with TemporaryDirectory() as tmp:
            ext = Path(tmp) / "ext"
            ext.mkdir(parents=True)
            (ext / "package.json").write_text(
                json.dumps({"name": "x", "engines": {"vscode": "^1.134.0"}}),
                encoding="utf-8",
            )
            with patch.object(ext_build, "EXTENSION_DIR", str(ext)):
                self.assertFalse(ext_build.fix_engines_vscode_compat())


if __name__ == "__main__":
    unittest.main()
