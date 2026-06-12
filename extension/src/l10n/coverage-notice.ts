/**
 * Activation coverage notice (plan 75 §2, Phase 1 tail).
 *
 * VS Code auto-selects the manifest NLS locale from the editor display language;
 * the user never picks one. Because the manifest chrome (command titles, settings,
 * menus) will lag the data viewer's own localization, a user running the editor in,
 * say, German could see mostly-English menus and assume nothing is translated. This
 * module shows a ONE-TIME, per-display-language notice when that chrome is mostly
 * untranslated, naming the language + percent and reassuring that the viewer itself
 * is localized.
 *
 * Policy is NOTIFY, NOT GATE (plan 75 §2): every locale bundle keeps shipping; this
 * notice is the entire user-facing mechanism. It is silent for English, for locales
 * we do not translate, and for locales already mostly complete.
 *
 * The decision logic ([evaluateCoverageNotice]) is pure and unit-tested; the vscode
 * binding ([maybeShowCoverageNotice]) is the thin shell that reads `env.language`,
 * the generated coverage snapshot, and the once-per-language gate in `globalState`.
 */
import * as vscode from 'vscode';

import { NLS_COVERAGE } from './nls-coverage-data';
import { t } from '../l10n';

/**
 * Locales the product family translates (plan 75 §1.2). `en` is the source and is
 * never a notice target. MUST mirror the catalog set in `assets/web/l10n.ts` /
 * `generation_handler.dart`. A display language outside this set is "untracked" —
 * we ship no bundle for it, so a low-coverage notice would be noise; stay silent.
 */
export const TRANSLATED_LOCALES = [
  'pt-br', 'zh-cn', 'zh-tw', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'ru',
];

/**
 * English display names for the translated locales, used to name the language in
 * the notice. Kept in English (not localized) because the notice may itself be
 * untranslated when shown; once translations exist the surrounding sentence — and
 * the convention of naming a language in its own tongue — is the translator's call.
 */
export const LANGUAGE_NAMES: Record<string, string> = {
  'pt-br': 'Brazilian Portuguese',
  'zh-cn': 'Simplified Chinese',
  'zh-tw': 'Traditional Chinese',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
};

/**
 * Below this percent of translated manifest values, the chrome reads as "mostly
 * English" and the notice fires. At or above it, the lag is minor — stay silent.
 */
export const COVERAGE_THRESHOLD = 90;

/** Per-display-language gate key prefix in `globalState` (shown once each). */
export const NOTICE_GATE_PREFIX = 'sda.l10nCoverageNotice.';

/**
 * Maps a raw BCP-47 display tag (`de-AT`, `pt-BR`, `zh-Hans-CN`) to a catalog tag.
 * Mirrors `normalizeLocale` in `assets/web/l10n.ts`: full lowercased tag first,
 * then the Chinese-script and pt-BR special cases, then the primary subtag; falls
 * back to `en`.
 */
export function normalizeLocale(raw: string | null | undefined): string {
  if (!raw) {
    return 'en';
  }
  const lower = raw.toLowerCase().replace(/_/g, '-');
  if (lower === 'en' || TRANSLATED_LOCALES.indexOf(lower) !== -1) {
    return lower;
  }
  if (lower.indexOf('zh') === 0) {
    if (lower.indexOf('hant') !== -1 || lower.indexOf('-tw') !== -1 || lower.indexOf('-hk') !== -1) {
      return 'zh-tw';
    }
    return 'zh-cn';
  }
  if (lower.indexOf('pt') === 0 && lower.indexOf('-br') !== -1) {
    return 'pt-br';
  }
  const primary = lower.split('-')[0];
  return primary === 'en' || TRANSLATED_LOCALES.indexOf(primary) !== -1 ? primary : 'en';
}

/** The decision a notice evaluation produces, when it should be shown. */
export interface CoverageNoticeDecision {
  /** Normalized catalog locale the notice is about. */
  locale: string;
  /** Translated percent (0–100), rounded. */
  pct: number;
  /** English display name of the language, for the message. */
  languageName: string;
}

/**
 * Pure decision: should the coverage notice show, and with what values?
 *
 * Returns `null` (stay silent) when the display language is English, untracked
 * (we ship no bundle), already at/above the threshold, or already shown. Otherwise
 * returns the locale + percent + language name to display. Kept free of `vscode`
 * so it is unit-testable.
 *
 * @param rawDisplayLanguage the editor display language (e.g. `vscode.env.language`)
 * @param coverage translated-locale → percent map (the generated `NLS_COVERAGE`)
 * @param alreadyShown whether the once-per-language gate has already fired
 */
export function evaluateCoverageNotice(
  rawDisplayLanguage: string | null | undefined,
  coverage: Record<string, number>,
  alreadyShown: boolean,
): CoverageNoticeDecision | null {
  const locale = normalizeLocale(rawDisplayLanguage);
  // English source and untracked languages never get the notice.
  if (locale === 'en' || TRANSLATED_LOCALES.indexOf(locale) === -1) {
    return null;
  }
  if (alreadyShown) {
    return null;
  }
  // A tracked locale with no bundle yet reads as 0% (absent from the map).
  const pct = Math.round(coverage[locale] ?? 0);
  if (pct >= COVERAGE_THRESHOLD) {
    return null;
  }
  return { locale, pct, languageName: LANGUAGE_NAMES[locale] ?? locale };
}

/**
 * Reads the live display language + coverage snapshot + once-per-language gate and
 * shows the notice when warranted. Fire-and-forget from activation; never throws
 * into the activation path. Marks the gate BEFORE showing so a slow/declined toast
 * cannot cause a repeat on the next window.
 */
export async function maybeShowCoverageNotice(
  context: vscode.ExtensionContext,
): Promise<void> {
  const locale = normalizeLocale(vscode.env.language);
  const gateKey = `${NOTICE_GATE_PREFIX}${locale}`;
  const alreadyShown = context.globalState.get<boolean>(gateKey) === true;

  const decision = evaluateCoverageNotice(vscode.env.language, NLS_COVERAGE, alreadyShown);
  if (!decision) {
    return;
  }

  // Never let a notice failure surface into the activation path — a missed notice
  // is strictly better than a broken activation. globalState.update is the only
  // awaited call that can reject (storage errors); guard the whole tail.
  try {
    // Mark first: an unshown notice is far better than a notice that nags every launch.
    await context.globalState.update(gateKey, true);
    void vscode.window.showInformationMessage(
      t('host.l10n.coverageNotice', decision.pct, decision.languageName),
    );
  } catch {
    // Swallow: the notice is advisory; activation must not depend on it.
  }
}
