# -*- coding: utf-8 -*-
"""Unit tests for modules.ext_build.check_file_line_limits.

Points the module's EXTENSION_DIR / REPO_ROOT at a temp directory holding
synthetic .ts source files, so the over-cap detection and the three-way
retry / continue / ignore prompt are exercised without touching the real
extension source tree. ask_choice is patched per case to drive each branch.
"""

from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules import ext_build


def _write_ts(src_dir: Path, name: str, lines: int) -> None:
    """Write a .ts file with exactly `lines` lines under src_dir."""
    (src_dir / name).write_text("\n".join("x" for _ in range(lines)), encoding="utf-8")


class TestCheckFileLineLimits(unittest.TestCase):
    """Branch coverage for the line-limit quality gate."""

    def _run(self, files: dict[str, int], *, choice: str | None = None):
        """Run the gate against synthetic files. Returns (result, mock_choice)."""
        with TemporaryDirectory() as tmp:
            ext = Path(tmp) / "ext"
            src = ext / "src"
            src.mkdir(parents=True)
            for name, lines in files.items():
                _write_ts(src, name, lines)
            # REPO_ROOT only feeds the relative-path display string; pointing it
            # at the temp root keeps the violation message deterministic.
            with patch.object(ext_build, "EXTENSION_DIR", str(ext)), \
                    patch.object(ext_build, "REPO_ROOT", str(tmp)), \
                    patch.object(ext_build, "MAX_FILE_LINES", 300), \
                    patch.object(ext_build, "MAX_TEST_FILE_LINES", 500), \
                    patch.object(ext_build, "ask_choice", return_value=choice) as mock_choice, \
                    patch.object(ext_build, "ok"), \
                    patch.object(ext_build, "warn"):
                result = ext_build.check_file_line_limits()
        return result, mock_choice

    def test_no_violation_passes_without_prompting(self) -> None:
        result, mock_choice = self._run({"a.ts": 100, "b.ts": 299})
        self.assertTrue(result)
        mock_choice.assert_not_called()

    def test_test_files_get_the_higher_cap(self) -> None:
        # 400-line .test.ts is under the 500 test cap; same count in a prod file
        # would breach the 300 cap. No prompt means it was treated as compliant.
        result, mock_choice = self._run({"a.test.ts": 400})
        self.assertTrue(result)
        mock_choice.assert_not_called()

    def test_continue_proceeds(self) -> None:
        result, mock_choice = self._run({"big.ts": 350}, choice="continue")
        self.assertTrue(result)
        mock_choice.assert_called_once()

    def test_ignore_proceeds(self) -> None:
        result, mock_choice = self._run({"big.ts": 350}, choice="ignore")
        self.assertTrue(result)
        mock_choice.assert_called_once()

    def test_retry_rescans_and_can_clear(self) -> None:
        # First scan finds a violation and the operator picks "retry"; the gate
        # re-invokes itself. On the recursive call the file still breaches, so a
        # retry that returns "continue" the second time proves the loop both
        # re-scans and terminates on a terminal choice.
        with TemporaryDirectory() as tmp:
            ext = Path(tmp) / "ext"
            src = ext / "src"
            src.mkdir(parents=True)
            _write_ts(src, "big.ts", 350)
            choices = iter(["retry", "continue"])
            with patch.object(ext_build, "EXTENSION_DIR", str(ext)), \
                    patch.object(ext_build, "REPO_ROOT", str(tmp)), \
                    patch.object(ext_build, "MAX_FILE_LINES", 300), \
                    patch.object(ext_build, "MAX_TEST_FILE_LINES", 500), \
                    patch.object(ext_build, "ask_choice", side_effect=lambda *a, **k: next(choices)) as mock_choice, \
                    patch.object(ext_build, "ok"), \
                    patch.object(ext_build, "warn"):
                result = ext_build.check_file_line_limits()
        self.assertTrue(result)
        self.assertEqual(mock_choice.call_count, 2)


if __name__ == "__main__":
    unittest.main()
