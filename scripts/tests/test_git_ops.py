# -*- coding: utf-8 -*-
"""Unit tests for modules.git_ops.git_commit_and_push.

Covers the hardened staging-area check: the function must only attempt a
``git commit`` when the *index* has staged changes, not when unrelated
files happen to be dirty in the working tree.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.git_ops import git_commit_and_push


def _make_config(
    stage_paths: tuple[str, ...] = ("extension/", "scripts/"),
    tag_prefix: str = "ext-v",
    display_name: str = "VS Code Extension",
    commit_msg_fmt: str = "Release ext-v{version}",
) -> SimpleNamespace:
    """Build a minimal TargetConfig-like object for testing."""
    return SimpleNamespace(
        git_stage_paths=stage_paths,
        tag_prefix=tag_prefix,
        display_name=display_name,
        commit_msg_fmt=commit_msg_fmt,
    )


def _run_result(returncode: int = 0, stdout: str = "", stderr: str = "") -> SimpleNamespace:
    return SimpleNamespace(returncode=returncode, stdout=stdout, stderr=stderr)


class TestGitCommitAndPush(unittest.TestCase):
    """Verify git_commit_and_push only commits when the index has staged files."""

    # ── nothing staged → skip commit, succeed ──────────────────

    @patch("modules.git_ops._warn_dirty_working_tree")
    @patch("modules.git_ops.ok")
    @patch("modules.git_ops.info")
    @patch("modules.git_ops.run")
    def test_no_staged_changes_skips_commit(
        self,
        mock_run: MagicMock,
        mock_info: MagicMock,
        mock_ok: MagicMock,
        mock_warn_dirty: MagicMock,
    ) -> None:
        """When git add stages nothing, commit must be skipped (not attempted)."""
        config = _make_config()

        # git add → ok, git diff --cached → empty (nothing staged)
        mock_run.side_effect = [
            _run_result(),      # git add
            _run_result(stdout=""),  # git diff --cached --name-only
        ]

        result = git_commit_and_push(config, "2.17.6")

        self.assertTrue(result, "Should succeed when nothing to commit")
        mock_ok.assert_any_call("No staged changes to commit")
        # Ensure git commit was never called (only 2 run() calls, not 3)
        self.assertEqual(mock_run.call_count, 2)

    # ── staged changes → commit + push ─────────────────────────

    @patch("modules.git_ops._warn_dirty_working_tree")
    @patch("modules.git_ops._push_to_origin", return_value=True)
    @patch("modules.git_ops.ok")
    @patch("modules.git_ops.info")
    @patch("modules.git_ops.run")
    def test_staged_changes_commits_and_pushes(
        self,
        mock_run: MagicMock,
        mock_info: MagicMock,
        mock_ok: MagicMock,
        mock_push: MagicMock,
        mock_warn_dirty: MagicMock,
    ) -> None:
        config = _make_config()

        mock_run.side_effect = [
            _run_result(),                              # git add
            _run_result(stdout="extension/package.json\n"),  # git diff --cached
            _run_result(),                              # git commit
        ]

        result = git_commit_and_push(config, "2.17.6")

        self.assertTrue(result)
        # The third run() call should be git commit
        commit_call = mock_run.call_args_list[2]
        self.assertIn("commit", commit_call[0][0])
        mock_push.assert_called_once()

    # ── git add fails → return False ───────────────────────────

    @patch("modules.git_ops.fail")
    @patch("modules.git_ops.info")
    @patch("modules.git_ops.run")
    def test_git_add_failure(
        self,
        mock_run: MagicMock,
        mock_info: MagicMock,
        mock_fail: MagicMock,
    ) -> None:
        config = _make_config()

        mock_run.return_value = _run_result(returncode=1, stderr="fatal: bad path")

        result = git_commit_and_push(config, "2.17.6")

        self.assertFalse(result)
        mock_fail.assert_called_once()
        self.assertIn("git add failed", mock_fail.call_args[0][0])

    # ── git commit fails → shows both stderr and stdout ────────

    @patch("modules.git_ops.fail")
    @patch("modules.git_ops.info")
    @patch("modules.git_ops.run")
    def test_commit_failure_shows_both_streams(
        self,
        mock_run: MagicMock,
        mock_info: MagicMock,
        mock_fail: MagicMock,
    ) -> None:
        """On commit failure, both stderr (hook output) and stdout should appear."""
        config = _make_config()

        mock_run.side_effect = [
            _run_result(),                                   # git add
            _run_result(stdout="extension/package.json\n"),  # git diff --cached
            _run_result(
                returncode=1,
                stderr="hook output here",
                stdout="more details here",
            ),  # git commit
        ]

        result = git_commit_and_push(config, "2.17.6")

        self.assertFalse(result)
        fail_msg = mock_fail.call_args[0][0]
        self.assertIn("hook output here", fail_msg)
        self.assertIn("more details here", fail_msg)

    # ── staged files are logged ────────────────────────────────

    @patch("modules.git_ops._warn_dirty_working_tree")
    @patch("modules.git_ops._push_to_origin", return_value=True)
    @patch("modules.git_ops.ok")
    @patch("modules.git_ops.info")
    @patch("modules.git_ops.run")
    def test_staged_files_are_logged(
        self,
        mock_run: MagicMock,
        mock_info: MagicMock,
        mock_ok: MagicMock,
        mock_push: MagicMock,
        mock_warn_dirty: MagicMock,
    ) -> None:
        """Each staged file should be printed for auditability."""
        config = _make_config()

        mock_run.side_effect = [
            _run_result(),
            _run_result(stdout="extension/package.json\nextension/out/ext.js\n"),
            _run_result(),  # git commit
        ]

        git_commit_and_push(config, "2.17.6")

        # Check that info() was called with each staged file
        info_calls = [c[0][0] for c in mock_info.call_args_list]
        staged_calls = [c for c in info_calls if "staged:" in c]
        self.assertEqual(len(staged_calls), 2)
        self.assertIn("extension/package.json", staged_calls[0])
        self.assertIn("extension/out/ext.js", staged_calls[1])


class TestWarnDirtyWorkingTree(unittest.TestCase):
    """Verify _warn_dirty_working_tree reports remaining dirty files."""

    @patch("modules.git_ops.warn")
    @patch("modules.git_ops.run")
    def test_dirty_files_produce_warnings(
        self,
        mock_run: MagicMock,
        mock_warn: MagicMock,
    ) -> None:
        """Dirty files outside stage paths should trigger [WARN] lines."""
        from modules.git_ops import _warn_dirty_working_tree

        config = _make_config(stage_paths=("extension/", "scripts/"))
        mock_run.return_value = _run_result(stdout=" M CHANGELOG.md\n")

        _warn_dirty_working_tree(config)

        # Should warn with the dirty file and the excluded paths
        warn_msgs = [c[0][0] for c in mock_warn.call_args_list]
        self.assertTrue(any("CHANGELOG.md" in m for m in warn_msgs))
        self.assertTrue(any("extension/" in m for m in warn_msgs))

    @patch("modules.git_ops.warn")
    @patch("modules.git_ops.run")
    def test_clean_tree_no_warnings(
        self,
        mock_run: MagicMock,
        mock_warn: MagicMock,
    ) -> None:
        """Clean working tree should produce no warnings."""
        from modules.git_ops import _warn_dirty_working_tree

        config = _make_config()
        mock_run.return_value = _run_result(stdout="")

        _warn_dirty_working_tree(config)

        mock_warn.assert_not_called()


if __name__ == "__main__":
    unittest.main()
