# -*- coding: utf-8 -*-
"""Unit tests for modules.checks_git.check_working_tree.

Mocks subprocess/git integration and interactive prompts. Ensures a clean tree never
invokes ``ask_yn`` (no false "dirty" continuation), and that publish vs analysis-only
copy does not imply commit/push when ``will_publish`` is False.
"""

from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.checks_git import check_working_tree


def _make_run_result(returncode: int = 0, stdout: str = "") -> SimpleNamespace:
    return SimpleNamespace(returncode=returncode, stdout=stdout, stderr="")


class TestCheckWorkingTree(unittest.TestCase):
    """Branch coverage for check_working_tree with mocked ``run`` and ``ask_yn``."""

    @patch("modules.checks_git.fail")
    @patch("modules.checks_git.run")
    def test_git_status_failure_returns_false(self, mock_run: MagicMock, mock_fail: MagicMock) -> None:
        mock_run.return_value = _make_run_result(returncode=1, stdout="")
        self.assertFalse(check_working_tree())
        mock_fail.assert_called_once()
        mock_run.assert_called_once()

    @patch("modules.checks_git.ask_yn")
    @patch("modules.checks_git.ok")
    @patch("modules.checks_git.run")
    def test_clean_tree_no_prompt(
        self,
        mock_run: MagicMock,
        mock_ok: MagicMock,
        mock_ask_yn: MagicMock,
    ) -> None:
        """Porcelain empty -> success without prompting (avoids false 'dirty' UX)."""
        mock_run.return_value = _make_run_result(stdout="   \n")
        self.assertTrue(check_working_tree())
        mock_ok.assert_called_once()
        mock_ask_yn.assert_not_called()

    @patch("modules.checks_git.ask_yn")
    @patch("modules.checks_git.info")
    @patch("modules.checks_git.warn")
    @patch("modules.checks_git.run")
    def test_dirty_publish_shows_commit_push_guidance(
        self,
        mock_run: MagicMock,
        mock_warn: MagicMock,
        mock_info: MagicMock,
        mock_ask_yn: MagicMock,
    ) -> None:
        mock_run.return_value = _make_run_result(stdout=" M pubspec.yaml\n")
        mock_ask_yn.return_value = True
        self.assertTrue(check_working_tree(will_publish=True))
        mock_ask_yn.assert_called_once_with("Continue with uncommitted changes?", default=False)
        info_arg = mock_info.call_args[0][0]
        self.assertIn("commit, and push", info_arg)
        self.assertIn("entire repo", info_arg)

    @patch("modules.checks_git.ask_yn")
    @patch("modules.checks_git.info")
    @patch("modules.checks_git.warn")
    @patch("modules.checks_git.run")
    def test_dirty_analyze_only_does_not_imply_immediate_push(
        self,
        mock_run: MagicMock,
        mock_warn: MagicMock,
        mock_info: MagicMock,
        mock_ask_yn: MagicMock,
    ) -> None:
        """Analysis-only must not claim this run will commit/push (false implication)."""
        mock_run.return_value = _make_run_result(stdout=" M foo.dart\n")
        mock_ask_yn.return_value = True
        self.assertTrue(check_working_tree(will_publish=False))
        mock_ask_yn.assert_called_once_with("Continue with uncommitted changes?", default=False)
        info_arg = mock_info.call_args[0][0]
        self.assertIn("analysis-only", info_arg.lower())
        self.assertIn("nothing will be committed", info_arg.lower())
        self.assertNotIn("If you continue, publish will", info_arg)

    @patch("modules.checks_git.ask_yn")
    @patch("modules.checks_git.info")
    @patch("modules.checks_git.warn")
    @patch("modules.checks_git.run")
    def test_user_declines_dirty_tree(
        self,
        mock_run: MagicMock,
        mock_warn: MagicMock,
        mock_info: MagicMock,
        mock_ask_yn: MagicMock,
    ) -> None:
        mock_run.return_value = _make_run_result(stdout="?? untracked.txt\n")
        mock_ask_yn.return_value = False
        self.assertFalse(check_working_tree(will_publish=True))


if __name__ == "__main__":
    unittest.main()
