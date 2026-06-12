# -*- coding: utf-8 -*-
"""Runtime (System B) localization toolchain for Saropa Drift Advisor (plan 75 §4).

Distinct from `scripts/modules/l10n_audit.py`, which audits the MANIFEST NLS
(System A — `package.nls*.json`). This package operates on the RUNTIME l10n: the
symbolic-key registries (`extension/src/l10n/strings-*.ts`,
`assets/web/l10n/strings-web*.ts`) and their two generated output formats —
host `l10n/bundle.l10n.<locale>.json` (English-value-keyed, for `vscode.l10n`) and
browser `assets/web/l10n/web.<locale>.json` (symbolic-key-keyed).

Entry point: `scripts/translate_l10n.py`. Run-modes: `audit` (classify + report,
never translates), `sync` (build/align the English baselines, never translates),
`translate` (the deliberate, operator-gated MT pass — refuses to run without an
explicit confirmation flag and a named locale set), `import` (re-import a
hand-filled gaps file). See plan 75 §4–§5 and §7 (never translate unattended).
"""
