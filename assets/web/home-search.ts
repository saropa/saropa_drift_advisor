/**
 * Pure matching logic for the Home tab's feature-search box.
 *
 * Extracted from home-screen.ts so it carries NO DOM or UI imports and can be
 * unit-tested directly (the web test harness esbuilds a single .ts entry point
 * and imports its exports — see assets/web/test/helpers.mjs). home-screen.ts
 * owns the DOM/card wiring and calls into these functions.
 */

/**
 * Lower-cased, de-duplicated match tokens for one card.
 *
 * Label + blurb are split into individual words so a single-word query can hit
 * either; the keyword phrases are kept WHOLE so a multi-word synonym like
 * "time travel" still matches as a phrase. De-duped to keep per-card scans tight.
 */
export function buildSearchTokens(label: string, blurb: string, keywords: string[]): string[] {
  var words = (label + ' ' + blurb).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  var all = words.concat(keywords.map(function (k) { return k.toLowerCase(); }));
  return Array.from(new Set(all));
}

/**
 * Fuzzy subsequence test: every character of `query` appears in `token` in order
 * (not necessarily adjacent). Looser than `includes` so "anmly" still finds
 * "anomaly". Applied PER token (never over concatenated text), which avoids the
 * false positives a subsequence match across a whole haystack would produce.
 *
 * `query` is assumed already lower-cased and trimmed by the caller.
 */
export function fuzzySubsequence(query: string, token: string): boolean {
  var q = 0;
  for (var i = 0; i < token.length && q < query.length; i++) {
    if (token[i] === query[q]) q++;
  }
  return q === query.length;
}

/**
 * True when any of a card's tokens substring- or fuzzy-matches the query.
 * An empty query matches everything (caller restores the full grid).
 */
export function tokensMatch(query: string, tokens: string[]): boolean {
  if (!query) return true;
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.indexOf(query) !== -1 || fuzzySubsequence(query, t)) return true;
  }
  return false;
}
