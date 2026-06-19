/**
 * Home tab — launcher grid for every primary tool plus Mask / Theme / Share,
 * a narrative feature overview, and a fuzzy feature-search box.
 *
 * The Tables/History sidebar switches that used to live here were removed: the
 * sidebar is toggled from its own chrome, and a pair of radio-like switches on
 * Home duplicated that control confusingly. `window._syncHomeSidebarToggles`
 * is no longer installed; its callers are all `typeof`-guarded and now no-op.
 */
import * as S from './state.ts';
import { vt } from './l10n.ts';
import { openTool } from './tabs.ts';

/**
 * Per-card search index: the card element plus its lower-cased match tokens
 * (label, blurb words, and dictionary synonyms). Rebuilt by buildToolGrid() and
 * read by the feature-search filter so matching never re-walks the DOM/data.
 */
var cardSearchIndex: { el: HTMLElement; tokens: string[] }[] = [];

/** Lower-cased, de-duplicated match tokens for one card. */
function buildTokens(label: string, blurb: string, keywords: string[]): string[] {
  // Split label + blurb into words so a single-word query can hit either; keep the
  // multi-word keyword phrases whole so a phrase like "time travel" still matches.
  var words = (label + ' ' + blurb).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  var all = words.concat(keywords.map(function (k) { return k.toLowerCase(); }));
  // De-dupe to keep the token list tight; Set→Array avoids repeated scans.
  return Array.from(new Set(all));
}

/**
 * Fuzzy subsequence test: every character of `query` appears in `token` in order
 * (not necessarily adjacent). Looser than `includes` so "anom"/"anmly" still find
 * "anomaly", but applied PER token (not the whole haystack) to avoid the false
 * positives a subsequence match over concatenated text would produce.
 */
function fuzzySubsequence(query: string, token: string): boolean {
  var q = 0;
  for (var i = 0; i < token.length && q < query.length; i++) {
    if (token[i] === query[q]) q++;
  }
  return q === query.length;
}

/** True when any of a card's tokens substring- or fuzzy-matches the query. */
function cardMatches(query: string, tokens: string[]): boolean {
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i];
    if (t.indexOf(query) !== -1 || fuzzySubsequence(query, t)) return true;
  }
  return false;
}

/** Applies the typed query: shows matching cards, hides the rest, toggles empty state. */
function applyFeatureFilter(query: string): void {
  var q = query.trim().toLowerCase();
  var empty = document.getElementById('home-feature-search-empty');
  // Empty query restores the full grid — never leave the user with a hidden tool.
  if (!q) {
    cardSearchIndex.forEach(function (entry) { entry.el.hidden = false; });
    if (empty) empty.hidden = true;
    return;
  }
  var shown = 0;
  cardSearchIndex.forEach(function (entry) {
    var match = cardMatches(q, entry.tokens);
    entry.el.hidden = !match;
    if (match) shown++;
  });
  // Tell the user when nothing matched rather than leaving an unexplained blank grid.
  if (empty) {
    if (shown === 0) {
      empty.textContent = vt('viewer.nav.home.search.noResults', query.trim());
      empty.hidden = false;
    } else {
      empty.hidden = true;
    }
  }
}

/** Appends one launcher/extra card to the grid and registers its search tokens. */
function addCard(
  grid: HTMLElement,
  id: string,
  label: string,
  iconName: string | undefined,
  blurb: string,
  color: string,
  keywords: string[],
  onClick: () => void,
  extra: boolean,
): void {
  var card = document.createElement('button');
  card.type = 'button';
  card.className = extra ? 'home-tool-card home-tool-card-extra' : 'home-tool-card';
  card.setAttribute(extra ? 'data-home-extra' : 'data-tool', id);
  // Drive the accent (left rule, icon tint, hover ring) from one custom property so
  // a single color value styles every accented surface of the card via CSS.
  card.style.setProperty('--tool-accent', color);
  card.title = vt('viewer.nav.home.cardTooltip', label, blurb);
  if (iconName) {
    var icon = document.createElement('span');
    icon.className = 'material-symbols-outlined home-tool-card-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = iconName;
    card.appendChild(icon);
  }
  var name = document.createElement('span');
  name.className = 'home-tool-card-name';
  name.textContent = label;
  card.appendChild(name);
  var blurbEl = document.createElement('span');
  blurbEl.className = 'home-tool-card-blurb';
  blurbEl.textContent = blurb;
  card.appendChild(blurbEl);
  card.addEventListener('click', onClick);
  grid.appendChild(card);
  cardSearchIndex.push({ el: card, tokens: buildTokens(label, blurb, keywords) });
}

function buildToolGrid(): void {
  var grid = document.getElementById('home-tool-grid');
  if (!grid) return;
  grid.replaceChildren();
  cardSearchIndex = [];

  S.HOME_LAUNCHERS.forEach(function (item) {
    var label = S.TOOL_LABELS[item.id] || item.id;
    addCard(
      grid,
      item.id,
      label,
      S.TOOL_ICONS[item.id],
      item.blurb,
      item.color,
      S.HOME_SEARCH_KEYWORDS[item.id] || [],
      function () { openTool(item.id); },
      false,
    );
  });

  S.HOME_EXTRAS.forEach(function (item) {
    addCard(
      grid,
      item.action,
      item.label,
      item.icon,
      item.blurb,
      item.color,
      S.HOME_SEARCH_KEYWORDS[item.action] || [],
      function () {
        if (item.action === 'mask') {
          document.getElementById('tb-mask-toggle')?.click();
          return;
        }
        if (item.action === 'theme') {
          document.getElementById('tb-theme-trigger')?.click();
          return;
        }
        if (item.action === 'share') document.getElementById('tb-share-btn')?.click();
      },
      true,
    );
  });
}

/** Fills the title + narrative lead and wires the live feature-search box. */
function initHomeIntro(): void {
  var title = document.getElementById('home-title');
  if (title) title.textContent = vt('viewer.nav.home.title');
  var lead = document.getElementById('home-lead');
  if (lead) lead.textContent = vt('viewer.nav.home.lead');

  var search = document.getElementById('home-feature-search') as HTMLInputElement | null;
  if (search) {
    search.placeholder = vt('viewer.nav.home.search.placeholder');
    search.setAttribute('aria-label', vt('viewer.nav.home.search.aria'));
    search.addEventListener('input', function () { applyFeatureFilter(search.value); });
    // Escape clears the filter and restores the full grid in one keystroke.
    search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && search.value) {
        search.value = '';
        applyFeatureFilter('');
      }
    });
  }
}

/** Builds the launcher grid and intro. Call once after DOM is ready. */
export function initHomeScreen(): void {
  buildToolGrid();
  initHomeIntro();
}
