/**
 * Natural language → SQL conversion.
 * Pure function: takes a question and schema metadata, returns SQL or an error.
 */

interface SchemaColumn {
  name: string;
  type: string;
  // Present on /api/schema/metadata; used by the relationship engine and PK
  // resolution. Optional so older callers / fixtures still type-check.
  pk?: boolean;
  notnull?: boolean;
}

/** A foreign-key edge: fromTable.fromColumn references toTable.toColumn. */
interface ForeignKey {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

interface SchemaTable {
  name: string;
  columns: SchemaColumn[];
  rowCount?: number;
}

interface SchemaMeta {
  tables: SchemaTable[];
  // Populated when metadata is fetched with includeForeignKeys=1. The
  // relationship engine reads this to offer / build EXISTS predicates.
  foreignKeys?: ForeignKey[];
}

interface NlResult {
  sql: string | null;
  table?: string;
  error?: string;
  // How the table was chosen ('named' = the question named it; 'guess' = we
  // inferred it) and the full candidate list, so the UI can show a clarifier.
  confidence?: 'named' | 'only' | 'ambiguous' | 'guess';
  candidates?: string[];
}

/**
 * Builds a SQLite WHERE predicate for a temporal phrase in the question, scoped
 * to the date column the verb implies. Returns '' when no temporal phrase is
 * present or the table has no usable date column — the caller ANDs the returned
 * predicate into the shared WHERE clause (so it composes with column filters).
 *
 * Without this, a question like "how many contacts changed today" silently
 * dropped both "changed" and "today", producing a bare `SELECT COUNT(*)` over
 * the whole table — the headline NL-to-SQL bug this guards against.
 *
 * The vocabulary is intentionally broad and typo-tolerant so casual phrasing
 * still lands a filter: edit-family vs birth-family verbs choose the column;
 * an ordered phrase table (most specific first) chooses the time window, from
 * sub-day ("last 2 hours") through single-day ("yesterday", "3 days ago"),
 * rolling windows ("past few weeks"), calendar periods ("last month", "this
 * quarter"), weekends, and *-to-date aliases ("ytd", "mtd").
 */
function temporalWhere(q: string, target: SchemaTable): string {
  // Candidate timestamp columns: anything whose name reads like a date/time.
  const dateCols = target.columns.filter(function (c) {
    return /date|time|_at\b|_on\b|created|updated|modified|changed|added|edited|inserted|registered|timestamp|stamp|datetime|mtime|ctime|\bwhen\b|\bts\b|expir|expiry|\bdue\b|publish|posted|logged|synced|seen|visited|login|logout|access|effective|valid|start|end|birth|\bdob\b/i.test(c.name);
  });
  if (dateCols.length === 0) return '';

  // Verb families decide WHICH column. Edit-family ("changed/updated/edited"
  // and common misspellings) targets the modified column; birth-family
  // ("created/added/new/joined") targets the creation column. A bare temporal
  // mention with no verb falls back to the first timestamp column.
  const editVerb = /\b(?:chang|chnag|chagn|chaneg|chnge|chg|modif|modfi|mdoif|\bmod\b|updat|udpat|upadt|updt|\bupd\b|upd8|edit|eddit|edt|alter|altr|amend|ammend|revis|rivis|touch|tweak|twaek|adjust|ajust|adust|refresh|refesh|re-?sav|overwrit|overwrot|rewr|rewrot|rework|reword|mutat|patch|bump|sync|synch|migrat|recalc|reprocess|reindex|restamp|dirtied|flipp|toggl|reset|log(?:ged)?[ -]?in|sign(?:ed)?[ -]?in|seen|used|access|visit)/i;
  const bornVerb = /\bcreat|\bcraet|\bcreaet|\bkreat|\bcrt\b|\bcre\b|\badd(?:ed|ing|s)?\b|\bnew\b|\binsert|\binser|\bins\b|\bregist|\breg\b|\bsign(?:ed)?[ -]?up|\bsignup|\bjoin|\bmade\b|\bimport|\bimpor|\benter(?:ed|ing|s)?\b|\bborn\b|\bestablish|\bgenerat|\bspawn|\boriginat|\bonboard|\bseed|\bprovision|\benrol|\bsubscrib|\bactivat|\bcaptur|\brecord|\bposted|\bfirst (?:seen|added|created)/i;
  const editCol = function (c: SchemaColumn) { return /updat|modif|chang|edit|alter|revis|touch|mtime|last.?mod|lastmod|sync|version|\brev\b|dirty|login|logged|seen|used|access|visit|active/i.test(c.name); };
  const bornCol = function (c: SchemaColumn) { return /creat|add|insert|regist|made|born|origin|ctime|first|since|seed|provision|enrol|subscrib|activat|signup|join|captur|logged|record|posted|import/i.test(c.name); };

  let col: SchemaColumn | undefined;
  if (editVerb.test(q)) col = dateCols.find(editCol);
  else if (bornVerb.test(q)) col = dateCols.find(bornCol);
  if (!col) col = dateCols[0];

  // Drift stores DateTime as INTEGER unix-epoch seconds by default; TEXT columns
  // hold ISO-8601. 'localtime' makes "today" mean the user's local day, not UTC.
  // `d` truncates to a calendar day; `dt` keeps clock time for sub-day windows.
  const isEpoch = /int/i.test(col.type);
  const d = isEpoch ? `date("${col.name}", 'unixepoch', 'localtime')` : `date("${col.name}")`;
  const dt = isEpoch ? `datetime("${col.name}", 'unixepoch', 'localtime')` : `datetime("${col.name}")`;

  // Fuzzy counts: digits, spelled-out numbers, and vague quantities so phrases
  // like "a couple of days" or "the last few weeks" resolve to a concrete N.
  const NUM = "(\\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple(?: of)?|few|several|dozen)";
  function count(tok: string): number {
    if (!tok) return 1;
    const t = tok.toLowerCase().replace(/\s+of$/, '').trim();
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    const w: { [k: string]: number } = {
      a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
      seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
      couple: 2, few: 3, several: 5, dozen: 12,
    };
    return w[t] != null ? w[t] : 1;
  }
  const W = function (frag: string) { return new RegExp(frag, 'i'); };

  // SQLite has no "start of quarter"; derive the quarter's first month from the
  // current month (1-3→+0, 4-6→+3, 7-9→+6, 10-12→+9 months past the year start).
  const monthExpr = "(CAST(strftime('%m','now','localtime') AS INTEGER)-1)/3*3";
  const qStart = `date('now', 'start of year', (${monthExpr}) || ' months', 'localtime')`;
  const qPrevLo = `date('now', 'start of year', ((${monthExpr}) - 3) || ' months', 'localtime')`;

  // Ordered matchers — first hit wins, so the most specific phrasing must lead.
  // Each entry returns the predicate body; ' WHERE ' is prepended by the caller.
  const matchers: Array<{ re: RegExp; f: (m: RegExpMatchArray) => string }> = [
    // ---- sub-day granularity (needs datetime, not a day-truncated date) ----
    { re: W('\\bthis hour\\b'), f: () => `${dt} >= strftime('%Y-%m-%d %H:00:00', 'now', 'localtime')` },
    { re: W('(?:in the |over the |during the )?(?:last|past|previous|prior) ' + NUM + ' hours?\\b'), f: m => `${dt} >= datetime('now', '-${count(m[1])} hours', 'localtime')` },
    { re: W('(?:in the )?(?:last|past|previous|prior) hour\\b'), f: () => `${dt} >= datetime('now', '-1 hour', 'localtime')` },
    { re: W('(?:last|past|previous|prior) ' + NUM + ' min(?:ute)?s?\\b'), f: m => `${dt} >= datetime('now', '-${count(m[1])} minutes', 'localtime')` },
    { re: W('(?:last|past|previous|prior) min(?:ute)?\\b'), f: () => `${dt} >= datetime('now', '-1 minute', 'localtime')` },
    { re: W('\\b(?:just now|right now|moments? ago|a moment ago|seconds? ago|any (?:second|minute) now)\\b'), f: () => `${dt} >= datetime('now', '-5 minutes', 'localtime')` },

    // ---- time-of-day windows on the current (or last) day ----
    { re: W('\\b(?:this morning|earlier this morning)\\b'), f: () => `${dt} >= strftime('%Y-%m-%d 00:00:00', 'now', 'localtime') AND ${dt} < strftime('%Y-%m-%d 12:00:00', 'now', 'localtime')` },
    { re: W('\\bthis afternoon\\b'), f: () => `${dt} >= strftime('%Y-%m-%d 12:00:00', 'now', 'localtime') AND ${dt} < strftime('%Y-%m-%d 17:00:00', 'now', 'localtime')` },
    { re: W('\\b(?:this evening|tonight)\\b'), f: () => `${dt} >= strftime('%Y-%m-%d 17:00:00', 'now', 'localtime')` },
    { re: W('\\b(?:last night|overnight|over ?night)\\b'), f: () => `${dt} >= strftime('%Y-%m-%d 18:00:00', 'now', '-1 day', 'localtime') AND ${dt} < strftime('%Y-%m-%d 06:00:00', 'now', 'localtime')` },
    { re: W('\\b(?:earlier today|so far today|today so far|thus far today)\\b'), f: () => `${d} = date('now', 'localtime')` },

    // ---- exact single day ----
    { re: W('\\b(?:the )?day before yesterday\\b'), f: () => `${d} = date('now', '-2 days', 'localtime')` },
    { re: W('\\b' + NUM + ' days? ago\\b'), f: m => `${d} = date('now', '-${count(m[1])} days', 'localtime')` },
    { re: W('\\b(?:to-?day|todya|tody|tdoay|toddate|2day)\\b'), f: () => `${d} = date('now', 'localtime')` },
    { re: W('\\b(?:yesterday|yestrday|yesteday|yesterdya|ystrday|yest)\\b'), f: () => `${d} = date('now', '-1 day', 'localtime')` },
    { re: W('\\b(?:to-?morrow|tommorow|tomorow|tomorrw|2morrow)\\b'), f: () => `${d} = date('now', '+1 day', 'localtime')` },

    // ---- rolling windows (a count of units back from now) ----
    { re: W('(?:in the |over the |within the |during the )?(?:last|past|previous|prior|recent) ' + NUM + ' days?\\b'), f: m => `${d} >= date('now', '-${count(m[1])} days', 'localtime')` },
    { re: W('(?:last|past|previous|prior) ' + NUM + ' weeks?\\b'), f: m => `${d} >= date('now', '-${count(m[1]) * 7} days', 'localtime')` },
    { re: W('(?:last|past|previous|prior) ' + NUM + ' months?\\b'), f: m => `${d} >= date('now', '-${count(m[1])} months', 'localtime')` },
    { re: W('(?:last|past|previous|prior) ' + NUM + ' years?\\b'), f: m => `${d} >= date('now', '-${count(m[1])} years', 'localtime')` },

    // ---- "since <anchor>" — must precede the calendar matchers below ----
    { re: W('\\bsince yesterday\\b'), f: () => `${d} >= date('now', '-1 day', 'localtime')` },
    { re: W('\\bsince last week\\b'), f: () => `${d} >= date('now', '-7 days', 'localtime')` },
    { re: W('\\bsince last month\\b'), f: () => `${d} >= date('now', 'start of month', '-1 month', 'localtime')` },

    // ---- rolling "past <unit>" (a trailing window, distinct from a calendar period) ----
    { re: W('\\b(?:in the |over the )?past week\\b'), f: () => `${d} >= date('now', '-7 days', 'localtime')` },
    { re: W('\\b(?:in the |over the )?past month\\b'), f: () => `${d} >= date('now', '-1 month', 'localtime')` },
    { re: W('\\b(?:in the |over the )?past year\\b'), f: () => `${d} >= date('now', '-1 year', 'localtime')` },
    { re: W('\\brecently\\b|\\blately\\b|\\bof late\\b|\\brecent\\b'), f: () => `${d} >= date('now', '-7 days', 'localtime')` },

    // ---- folksy / less-common spans (fortnight, decade, "the other day") ----
    { re: W('\\b(?:a |one )?fortnight ago\\b'), f: () => `${d} = date('now', '-14 days', 'localtime')` },
    { re: W('\\b(?:last|past|this|in the last) fortnight\\b'), f: () => `${d} >= date('now', '-14 days', 'localtime')` },
    { re: W('\\b(?:last|past|this|in the last) decade\\b'), f: () => `${d} >= date('now', '-10 years', 'localtime')` },
    { re: W('\\bthe other day\\b'), f: () => `${d} >= date('now', '-3 days', 'localtime')` },
    { re: W('\\ba (?:while|bit) (?:ago|back)\\b|\\bsome time ago\\b'), f: () => `${d} >= date('now', '-30 days', 'localtime')` },
    { re: W('\\bsince today\\b|\\bsince this morning\\b'), f: () => `${d} = date('now', 'localtime')` },

    // ---- the weekend (the most recent Saturday–Sunday) ----
    { re: W('\\b(?:over |on |during )?(?:the|this|last) weekend\\b|\\bthe weekend\\b'), f: () => `${d} >= date('now', 'weekday 6', '-7 days', 'localtime') AND ${d} < date('now', 'weekday 6', '-5 days', 'localtime')` },

    // ---- calendar previous period (closed at the current period's start) ----
    { re: W('\\b(?:last|previous|prior) week\\b'), f: () => `${d} >= date('now', 'weekday 0', '-13 days', 'localtime') AND ${d} < date('now', 'weekday 0', '-6 days', 'localtime')` },
    { re: W('\\b(?:last|previous|prior) month\\b'), f: () => `${d} >= date('now', 'start of month', '-1 month', 'localtime') AND ${d} < date('now', 'start of month', 'localtime')` },
    { re: W('\\b(?:last|previous|prior) (?:quarter|qtr)\\b'), f: () => `${d} >= ${qPrevLo} AND ${d} < ${qStart}` },
    { re: W('\\b(?:last|previous|prior) year\\b'), f: () => `${d} >= date('now', 'start of year', '-1 year', 'localtime') AND ${d} < date('now', 'start of year', 'localtime')` },

    // ---- current calendar period, including *-to-date aliases ----
    { re: W('\\bthis week\\b|\\bthus week\\b|\\bweek to date\\b|\\bwtd\\b|\\bso far this week\\b'), f: () => `${d} >= date('now', 'weekday 0', '-6 days', 'localtime')` },
    { re: W('\\bthis month\\b|\\bmonth to date\\b|\\bmtd\\b|\\bso far this month\\b'), f: () => `${d} >= date('now', 'start of month', 'localtime')` },
    { re: W('\\bthis (?:quarter|qtr)\\b|\\bquarter to date\\b|\\bqtd\\b'), f: () => `${d} >= ${qStart}` },
    { re: W('\\bthis year\\b|\\byear to date\\b|\\bytd\\b|\\bso far this year\\b'), f: () => `${d} >= date('now', 'start of year', 'localtime')` },

    // ---- bare single day ("today") — last, so phrases above win first ----
    { re: W('\\btoday\\b'), f: () => `${d} = date('now', 'localtime')` },
  ];

  // ---- generated matchers: named weekdays, months, explicit years / quarters,
  // and compact dashboard tokens. Spliced in just ahead of the bare "today"
  // fallback so the worded phrases above still take precedence. ----

  // Most recent occurrence of a weekday, including today. strftime('%w') numbers
  // Sunday=0 … Saturday=6; the modulo keeps the offset in [0,6] days back.
  const weekdayEq = function (n: number): string {
    const back = `((CAST(strftime('%w','now','localtime') AS INTEGER) - ${n} + 7) % 7)`;
    return `${d} = date('now', '-' || ${back} || ' days', 'localtime')`;
  };
  const WEEKDAYS: Array<[number, string]> = [
    [0, 'sun(?:day)?'], [1, 'mon(?:day)?'], [2, 'tue(?:s|sday)?'],
    [3, 'wed(?:nesday|s)?'], [4, 'thu(?:r|rs|rsday)?'], [5, 'fri(?:day)?'],
    [6, 'sat(?:urday)?'],
  ];
  const weekdayMatchers = WEEKDAYS.map(function (wd) {
    return { re: W('\\b(?:on |last |this |past )?(?:' + wd[1] + ')\\b'), f: function () { return weekdayEq(wd[0]); } };
  });

  // Most recent occurrence of a named month, as a whole-month range. A leading
  // qualifier is required so everyday words ("may", "march") don't false-fire.
  const monthRange = function (n: number): string {
    const back = `((CAST(strftime('%m','now','localtime') AS INTEGER) - ${n} + 12) % 12)`;
    const lo = `date('now', 'start of month', '-' || ${back} || ' months', 'localtime')`;
    const hi = `date('now', 'start of month', '-' || ${back} || ' months', '+1 month', 'localtime')`;
    return `${d} >= ${lo} AND ${d} < ${hi}`;
  };
  const MONTHS: Array<[number, string]> = [
    [1, 'jan(?:uary)?'], [2, 'feb(?:ruary)?'], [3, 'mar(?:ch)?'], [4, 'apr(?:il)?'],
    [5, 'may'], [6, 'jun(?:e)?'], [7, 'jul(?:y)?'], [8, 'aug(?:ust)?'],
    [9, 'sep(?:t|tember)?'], [10, 'oct(?:ober)?'], [11, 'nov(?:ember)?'], [12, 'dec(?:ember)?'],
  ];
  const monthMatchers = MONTHS.map(function (mo) {
    return { re: W('\\b(?:in|during|throughout|this|last|month of|back in|since|over|for)\\s+(?:' + mo[1] + ')\\b'), f: function () { return monthRange(mo[0]); } };
  });

  // Explicit four-digit years (in / since / before / after) and Q1–Q4 of the
  // current calendar year. Literal 'YYYY-MM-DD' strings compare against date().
  const yearMatchers = [
    { re: W('\\b(?:in|during|throughout)\\s+((?:19|20)\\d{2})\\b'), f: (m: RegExpMatchArray) => `${d} >= '${m[1]}-01-01' AND ${d} < '${+m[1] + 1}-01-01'` },
    { re: W('\\bsince\\s+((?:19|20)\\d{2})\\b'), f: (m: RegExpMatchArray) => `${d} >= '${m[1]}-01-01'` },
    { re: W('\\b(?:before|prior to|earlier than)\\s+((?:19|20)\\d{2})\\b'), f: (m: RegExpMatchArray) => `${d} < '${m[1]}-01-01'` },
    { re: W('\\b(?:after|since the end of)\\s+((?:19|20)\\d{2})\\b'), f: (m: RegExpMatchArray) => `${d} >= '${+m[1] + 1}-01-01'` },
    { re: W('\\bq([1-4])\\b'), f: (m: RegExpMatchArray) => `${d} >= date('now', 'start of year', '${(+m[1] - 1) * 3} months', 'localtime') AND ${d} < date('now', 'start of year', '${(+m[1]) * 3} months', 'localtime')` },
  ];

  // Compact duration tokens, dashboard-style: "24h", "7d", "2w", "3mo", "1y",
  // "15min", plus "T-7". Bare "m" is excluded on purpose (months/minutes clash).
  const compactWindow = function (n: number, unit: string): string {
    const u = unit.toLowerCase();
    if (/^(?:h|hr|hrs|hour)/.test(u)) return `${dt} >= datetime('now', '-${n} hours', 'localtime')`;
    if (/^min/.test(u)) return `${dt} >= datetime('now', '-${n} minutes', 'localtime')`;
    if (/^(?:w|wk|week)/.test(u)) return `${d} >= date('now', '-${n * 7} days', 'localtime')`;
    if (/^(?:mo|mth|month)/.test(u)) return `${d} >= date('now', '-${n} months', 'localtime')`;
    if (/^(?:y|yr|year)/.test(u)) return `${d} >= date('now', '-${n} years', 'localtime')`;
    return `${d} >= date('now', '-${n} days', 'localtime')`;
  };
  const compactMatchers = [
    // Digits required (not spelled-out numbers): otherwise "and" reads as
    // "an"+"d" → a bogus 1-day window. Compact tokens are always numeric anyway.
    { re: W('\\b(\\d+)\\s*(hours?|hrs?|h|minutes?|mins?|weeks?|wks?|w|months?|mths?|mos?|mo|years?|yrs?|y|days?|dys?|d)\\b(?:\\s*ago)?'), f: (m: RegExpMatchArray) => compactWindow(count(m[1]), m[2]) },
    { re: W('\\bt-?(\\d+)\\b'), f: (m: RegExpMatchArray) => `${d} >= date('now', '-${m[1]} days', 'localtime')` },
  ];

  matchers.splice(matchers.length - 1, 0,
    ...weekdayMatchers, ...monthMatchers, ...yearMatchers, ...compactMatchers);

  // Staleness / inverse windows — "not touched in N units", "older than N
  // units", "stale / dormant". These emit a `<` (older-than) predicate and are
  // checked FIRST: the embedded "last 30 days" would otherwise match a positive
  // (>=) window and invert the meaning. (QA hunts stale rows; PMs and marketing
  // build dormant / re-engagement segments; analysts measure neglect.)
  const olderUnit = function (n: number, unit: string): string {
    const u = unit.toLowerCase();
    if (/^h/.test(u)) return `${dt} < datetime('now', '-${n} hours', 'localtime')`;
    if (/^w/.test(u)) return `${d} < date('now', '-${n * 7} days', 'localtime')`;
    if (/^mo|^month/.test(u)) return `${d} < date('now', '-${n} months', 'localtime')`;
    if (/^y/.test(u)) return `${d} < date('now', '-${n} years', 'localtime')`;
    return `${d} < date('now', '-${n} days', 'localtime')`;
  };
  const UNIT = '(hours?|days?|weeks?|months?|years?)';
  // "active" is deliberately excluded here — a bare "inactive" is handled as the
  // active=0 boolean flag elsewhere; staleness keys on activity/edit verbs so
  // the two readings don't both fire and over-filter.
  const staleMatchers = [
    { re: W("\\b(?:not|never|hasn'?t|haven'?t|isn'?t|aren'?t|no)\\s+(?:been\\s+)?(?:updated|changed|modified|touched|edited|logged[ -]?in|signed[ -]?in|seen|used|accessed|visited)\\s+(?:in|for|within|since)\\s+(?:the\\s+(?:last|past)\\s+)?" + NUM + '\\s*' + UNIT), f: (m: RegExpMatchArray) => olderUnit(count(m[1]), m[2]) },
    { re: W('\\b(?:older than|more than|over)\\s+' + NUM + '\\s*' + UNIT + '(?:\\s+(?:old|ago))?'), f: (m: RegExpMatchArray) => olderUnit(count(m[1]), m[2]) },
    { re: W('\\b(?:stale|dormant|abandoned|untouched|idle|neglected|dead)\\s+(?:for\\s+)?' + NUM + '\\s*' + UNIT), f: (m: RegExpMatchArray) => olderUnit(count(m[1]), m[2]) },
    { re: W('\\b(?:stale|dormant|abandoned|untouched|idle|neglected)\\b'), f: () => `${d} < date('now', '-30 days', 'localtime')` },
    { re: W("\\b(?:not|never|hasn'?t|haven'?t)\\s+(?:been\\s+)?(?:updated|changed|touched|logged[ -]?in|seen|used)\\s+(?:in|for)\\s+(?:a\\s+)?(?:while|long time|ages)"), f: () => `${d} < date('now', '-90 days', 'localtime')` },
  ];
  matchers.unshift(...staleMatchers);

  for (let i = 0; i < matchers.length; i++) {
    const m = q.match(matchers[i].re);
    if (m) return matchers[i].f(m);
  }
  return '';
}

/** Finds the column a free-text word refers to (exact, spaced, or substring). */
function matchColumn(word: string, target: SchemaTable): SchemaColumn | null {
  const w = word.toLowerCase().trim();
  const wUnderscored = w.replace(/\s+/g, '_');
  return target.columns.find(function (c) { return c.name.toLowerCase() === wUnderscored; })
    || target.columns.find(function (c) { return c.name.toLowerCase().replace(/_/g, ' ') === w; })
    || target.columns.find(function (c) { return c.name.toLowerCase().indexOf(wUnderscored) >= 0 || wUnderscored.indexOf(c.name.toLowerCase()) >= 0; })
    || null;
}

/**
 * Extracts column-level predicates (comparisons, equality, text match,
 * NULL/empty checks) from the question as an array of SQL conditions for the
 * caller to AND together. Pure heuristic: it only emits a condition for
 * phrasings it recognizes, so the failure mode is a broader result set the
 * developer refines — never a malformed query. String values are quote-escaped
 * and LIKE wildcards are escaped, so user text can't break out of the literal.
 */
function valueWhere(question: string, target: SchemaTable): string[] {
  // Operate on the ORIGINAL (mixed-case) text so captured values keep their
  // case ("US", "John"); regexes carry the 'i' flag for case-insensitive
  // matching. Text equality also gets COLLATE NOCASE so "active" still matches
  // a stored "Active".
  const q = question;
  const conds: string[] = [];
  const NUMV = '(-?\\d+(?:\\.\\d+)?)';
  const VAL = '(\'[^\']*\'|"[^"]*"|[\\w@.+\\-]+)';
  const lit = function (v: string) { return "'" + v.replace(/'/g, "''") + "'"; };
  const unq = function (t: string) {
    if (!t) return '';
    const a = t.charAt(0), b = t.charAt(t.length - 1);
    if ((a === "'" && b === "'") || (a === '"' && b === '"')) return t.slice(1, -1);
    return t;
  };
  const isNum = function (v: string) { return /^-?\d+(?:\.\d+)?$/.test(v); };
  const escRe = function (s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  // A column name with underscores treated as optional spaces, word-bounded.
  const frag = function (name: string) { return '\\b' + escRe(name).replace(/_/g, '[_ ]?') + '\\b'; };
  // LIKE literal with % and _ escaped so they stay literal, wrapped per position.
  const likeVal = function (v: string, pre: string, post: string) {
    return "'" + pre + v.replace(/'/g, "''").replace(/([%_\\])/g, '\\$1') + post + "' ESCAPE '\\'";
  };

  // Longest column names first so "first_name" wins over "name" on overlap.
  const cols = target.columns.slice().sort(function (a, b) { return b.name.length - a.name.length; });
  for (let ci = 0; ci < cols.length; ci++) {
    const c = cols[ci];
    const cn = '"' + c.name + '"';
    const F = frag(c.name.toLowerCase());
    const after = function (body: string) { return new RegExp(F + body, 'i'); };
    let m: RegExpMatchArray | null;

    // NULL / empty — "no email", "missing phone", "name is blank".
    if (new RegExp('\\b(?:no|without|missing|lacking|lacks|has no|have no|with no|blank|empty)\\s+(?:an?\\s+)?' + F, 'i').test(q)
      || after('\\s+(?:is|are)\\s+(?:null|empty|blank|missing|unset|not set|absent)').test(q)) {
      conds.push('(' + cn + ' IS NULL OR ' + cn + " = '')");
      continue;
    }
    // Range — "age between 18 and 65".
    if ((m = q.match(after('\\s*(?:between|from)\\s*' + NUMV + '\\s*(?:and|to|[-–])\\s*' + NUMV)))) {
      conds.push(cn + ' BETWEEN ' + m[1] + ' AND ' + m[2]); continue;
    }
    // Sign checks (numeric columns only) — "negative balance", "amount is
    // positive", "zero stock". A QA / analyst staple for spotting bad data.
    const numericType = /int|real|num|float|double|dec/i.test(c.type || '');
    if (numericType && (new RegExp('\\bnegative\\s+' + F, 'i').test(q) || after('\\s+(?:is|are)\\s+negative').test(q))) { conds.push(cn + ' < 0'); continue; }
    if (numericType && (new RegExp('\\bpositive\\s+' + F, 'i').test(q) || after('\\s+(?:is|are)\\s+positive').test(q))) { conds.push(cn + ' > 0'); continue; }
    if (numericType && (new RegExp('\\bzero\\s+' + F, 'i').test(q) || after('\\s+(?:is|are)\\s+zero').test(q))) { conds.push(cn + ' = 0'); continue; }
    // >= / <= checked before > / < so the longer phrasing wins.
    if ((m = q.match(after('\\s*(?:>=|=>|at least|no less than|minimum of|min of)\\s*' + NUMV)))) { conds.push(cn + ' >= ' + m[1]); continue; }
    if ((m = q.match(after('\\s*(?:<=|=<|at most|no more than|maximum of|max of|up to)\\s*' + NUMV)))) { conds.push(cn + ' <= ' + m[1]); continue; }
    if ((m = q.match(after('\\s*(?:>|greater than|more than|over|above|exceeds?|bigger than|larger than)\\s*' + NUMV)))) { conds.push(cn + ' > ' + m[1]); continue; }
    if ((m = q.match(after('\\s*(?:<|less than|fewer than|under|below|smaller than)\\s*' + NUMV)))) { conds.push(cn + ' < ' + m[1]); continue; }
    // Text search.
    if ((m = q.match(after('\\s*(?:contains?|containing|like|matching|includes?)\\s*' + VAL)))) { conds.push(cn + ' LIKE ' + likeVal(unq(m[1]), '%', '%')); continue; }
    if ((m = q.match(after('\\s*(?:starts? with|begins? with|beginning with|prefixed with)\\s*' + VAL)))) { conds.push(cn + ' LIKE ' + likeVal(unq(m[1]), '', '%')); continue; }
    if ((m = q.match(after('\\s*(?:ends? with|ending with|suffixed with)\\s*' + VAL)))) { conds.push(cn + ' LIKE ' + likeVal(unq(m[1]), '%', '')); continue; }
    // Negated equality (checked before equality so "is not" beats "is").
    if ((m = q.match(after("\\s*(?:is not|isn'?t|are not|aren'?t|!=|<>|not equal to|not)\\s*" + VAL)))) {
      const v = unq(m[1]);
      if (/^null$/i.test(v)) conds.push(cn + ' IS NOT NULL');
      else if (/^(true|false)$/i.test(v)) conds.push(cn + ' != ' + (/true/i.test(v) ? '1' : '0'));
      else if (isNum(v)) conds.push(cn + ' != ' + v);
      else conds.push(cn + ' != ' + lit(v) + ' COLLATE NOCASE');
      continue;
    }
    // Equality.
    if ((m = q.match(after('\\s*(?:==|=|is|are|equals?|equal to)\\s*' + VAL)))) {
      const v = unq(m[1]);
      if (/^null$/i.test(v)) conds.push(cn + ' IS NULL');
      else if (/^(true|false)$/i.test(v)) conds.push(cn + ' = ' + (/true/i.test(v) ? '1' : '0'));
      else if (isNum(v)) conds.push(cn + ' = ' + v);
      else conds.push(cn + ' = ' + lit(v) + ' COLLATE NOCASE');
      continue;
    }
    // NOT NULL / present — "has email", "with a phone", "name is set". Checked
    // LAST so an operator phrase ("with age over 30") wins over a bare presence
    // reading of the same "with <col>".
    if (new RegExp('\\b(?:has|have|having|with|non-?empty)\\s+(?:an?\\s+)?' + F, 'i').test(q)
      || after('\\s+(?:is|are)\\s+(?:set|present|provided|not null|not empty)').test(q)) {
      conds.push('(' + cn + ' IS NOT NULL AND ' + cn + " != '')");
      continue;
    }
  }

  // Bare boolean flags — "active contacts", "inactive users", "not archived".
  // Only for boolean-ish columns (an int/bool whose name reads like a flag) so
  // "age"/"id" are never coerced to "= 1". Skipped when the column already got
  // an explicit predicate above, to avoid a contradictory "= 0 AND = 1".
  const boolish = function (c: SchemaColumn) {
    return /bool|int|tinyint/i.test(c.type || '')
      && /^is_|^has_|^can_|active|enabled?|disabled?|verified|visible|hidden|archived|deleted|locked|starred|pinned|favou?rite|public|private|completed?|done|paid|unread|read|sent|approved|rejected|blocked|banned/i.test(c.name);
  };
  for (let bi = 0; bi < target.columns.length; bi++) {
    const c = target.columns[bi];
    if (!boolish(c)) continue;
    const cn = '"' + c.name + '"';
    if (conds.some(function (x) { return x.indexOf(cn) >= 0; })) continue;
    // Match the column name and a copy with any is_/has_/can_ prefix stripped,
    // so "is_active" also responds to a bare "active".
    const spaced = c.name.toLowerCase().replace(/_/g, ' ');
    const stripped = c.name.toLowerCase().replace(/^(?:is|has|can)_/, '').replace(/_/g, ' ');
    // Skip if this flag word was already consumed as ANOTHER column's value —
    // "status is not active" means status != 'active', not also active = 0.
    const lowerConds = conds.join(' ').toLowerCase();
    if (lowerConds.indexOf("'" + spaced + "'") >= 0 || lowerConds.indexOf("'" + stripped + "'") >= 0) continue;
    const vAlt = (stripped !== spaced ? [spaced, stripped] : [spaced]).map(escRe).join('|');
    // Negation: "not active", or an in-/un-/non- prefix glued on ("inactive").
    const neg = new RegExp("\\b(?:not|non-?|isn'?t|aren'?t)\\s+(?:" + vAlt + ')\\b|\\b(?:in|un|non)(?:' + vAlt + ')\\b', 'i');
    const pos = new RegExp('\\b(?:' + vAlt + ')\\b', 'i');
    if (neg.test(q)) conds.push(cn + ' = 0');
    else if (pos.test(q)) conds.push(cn + ' = 1');
  }

  // "named / called / search for / look up X" → a fuzzy match on the most
  // name-like text column. App users reach for these plain-language verbs.
  const nameCol = target.columns.find(function (c) {
    return /name|title|label/i.test(c.name) && /char|text|clob|string|varchar/i.test(c.type || 'text');
  });
  let nm: RegExpMatchArray | null;
  if (nameCol && (nm = q.match(new RegExp('\\b(?:named|called|search(?:ing)? for|look(?:ing)? up|lookup)\\s+' + VAL, 'i')))) {
    const nv = unq(nm[1]);
    const tnLower = target.name.toLowerCase();
    // Skip a bare number or the table's own name ("look up contacts").
    if (nv && !isNum(nv) && nv.toLowerCase() !== tnLower && nv.toLowerCase() !== tnLower.replace(/s$/, '')) {
      conds.push('"' + nameCol.name + '" LIKE ' + likeVal(nv, '%', '%'));
    }
  }

  // QA: "test accounts / test data" → rows whose name or email carries the
  // conventional "test" marker, across whichever text identity columns exist.
  if (/\btest\s+(?:account|accounts|data|user|users|record|records|entr|email|emails|row|rows)\b/i.test(q)) {
    const tcols = target.columns.filter(function (c) {
      return /name|email|title|label|user|login|handle/i.test(c.name) && /char|text|clob|string|varchar/i.test(c.type || 'text');
    });
    if (tcols.length) conds.push('(' + tcols.map(function (c) { return '"' + c.name + "\" LIKE '%test%'"; }).join(' OR ') + ')');
  }

  // Marketing: subscription / opt-in flag inferred from a boolean-ish column.
  const optCol = target.columns.find(function (c) {
    return /bool|int/i.test(c.type || '') && /subscrib|opt[_-]?in|optin|consent|newsletter|marketing/i.test(c.name);
  });
  if (optCol && !conds.some(function (x) { return x.indexOf('"' + optCol.name + '"') >= 0; })) {
    if (/\b(?:unsubscribed|opted[ -]?out|opt[ -]?out|not subscribed|no consent|without consent)\b/i.test(q)) conds.push('"' + optCol.name + '" = 0');
    else if (/\b(?:subscribed|opted[ -]?in|opt[ -]?in|consented|on the (?:mailing|email) list|newsletter signups?)\b/i.test(q)) conds.push('"' + optCol.name + '" = 1');
  }
  return conds;
}

/**
 * Detects an explicit ordering request ("order by name desc", "newest first",
 * "alphabetical", "top N by balance") and returns an ' ORDER BY …' clause, or
 * '' when none is found. Kept separate from the aggregate dispatch so a sort
 * phrase doesn't get swallowed by the "by <word>" group-by heuristic.
 */
function orderClause(q: string, target: SchemaTable): string {
  const dateCol = target.columns.find(function (c) { return /date|time|created|updated|_at\b|timestamp/i.test(c.name); });
  const textCol = target.columns.find(function (c) { return /name|title|label|email/i.test(c.name); })
    || target.columns.find(function (c) { return /char|text|clob/i.test(c.type || ''); });
  let m: RegExpMatchArray | null;

  // Explicit "order/sort by <col> [asc|desc]".
  if ((m = q.match(/\b(?:order|sort)(?:ed)?\s+by\s+([a-z0-9_ ]+?)(?:\s+(asc|ascending|desc|descending|high to low|low to high))?\s*$/i))
    || (m = q.match(/\b(?:order|sort)(?:ed)?\s+by\s+([a-z0-9_]+)(?:\s+(asc|ascending|desc|descending))?/i))) {
    const col = matchColumn(m[1], target);
    if (col) {
      const desc = /desc|high to low/i.test(m[2] || '');
      return ' ORDER BY "' + col.name + '"' + (desc ? ' DESC' : ' ASC');
    }
  }
  if (dateCol && /\b(?:newest|most recent|latest|recent)\s+first\b/i.test(q)) return ' ORDER BY "' + dateCol.name + '" DESC';
  if (dateCol && /\b(?:oldest|earliest)\s+first\b/i.test(q)) return ' ORDER BY "' + dateCol.name + '" ASC';
  if (textCol && /\breverse alphabetical\b|\bz\s*(?:-|to)\s*a\b/i.test(q)) return ' ORDER BY "' + textCol.name + '" DESC';
  if (textCol && /\balphabetical\b|\ba\s*(?:-|to)\s*z\b/i.test(q)) return ' ORDER BY "' + textCol.name + '" ASC';

  // "longest / shortest <col>" → order by text length (QA: outlier field sizes).
  if ((m = q.match(/\blongest\s+([a-z0-9_]+)/i))) { const col = matchColumn(m[1], target); if (col) return ' ORDER BY LENGTH("' + col.name + '") DESC'; }
  if ((m = q.match(/\bshortest\s+([a-z0-9_]+)/i))) { const col = matchColumn(m[1], target); if (col) return ' ORDER BY LENGTH("' + col.name + '") ASC'; }

  // "top N by <col>" / "bottom N by <col>" → ordering, not grouping.
  if (/\b(?:top|first|bottom)\b/i.test(q) && (m = q.match(/\bby\s+([a-z0-9_]+)/i))) {
    const col = matchColumn(m[1], target);
    if (col) return ' ORDER BY "' + col.name + '"' + (/\bbottom\b/i.test(q) ? ' ASC' : ' DESC');
  }
  return '';
}

/** Extracts a row cap from "top N", "first N", "N rows", "a dozen", etc. */
function limitFrom(q: string): number | null {
  let m: RegExpMatchArray | null;
  if ((m = q.match(/\b(?:top|first|limit|show|give me|return|fetch|head)\s+(\d+)\b/i))) return parseInt(m[1], 10);
  if ((m = q.match(/\b(\d+)\s+(?:rows?|records?|results?|entries|items)\b/i))) return parseInt(m[1], 10);
  if (/\ba dozen\b/i.test(q)) return 12;
  if (/\ba handful\b/i.test(q)) return 5;
  if (/\ba few\b/i.test(q)) return 3;
  if (/\ba couple\b/i.test(q)) return 2;
  if (/\b(?:top|first|head)\b/i.test(q)) return 10;
  return null;
}

/** Converts a natural language question to a SQL query using schema metadata. */
/** English-ish singularizer for matching table names: companies→company,
 *  addresses→address, phones→phone. Good enough for FK-table name matching. */
function singularize(n: string): string {
  if (/ies$/.test(n)) return n.replace(/ies$/, 'y');
  if (/(ses|xes|zes|ches|shes)$/.test(n)) return n.replace(/es$/, '');
  if (/s$/.test(n) && !/ss$/.test(n)) return n.replace(/s$/, '');
  return n;
}

// Shared number parser for relationship quantifiers ("more than two phones").
const REL_COUNT_WORDS: { [k: string]: number } = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, couple: 2, few: 3, several: 5,
};
function numFromToken(tok: string): number {
  if (!tok) return 1;
  const t = tok.toLowerCase().replace(/\s+of$/, '').trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return REL_COUNT_WORDS[t] != null ? REL_COUNT_WORDS[t] : 1;
}

/**
 * Builds FK-relationship predicates from the question — "contacts with more
 * than one phone", "without any orders", "that belong to a company". Uses
 * row-preserving EXISTS / correlated-count subqueries (never JOINs) so the
 * result stays rows-of-the-base-table. Returns [] when the schema has no FK
 * metadata or the question names no related table.
 *
 * children(target) = tables whose FK points AT target (target "has" them);
 * parents(target)  = tables target's own FK points at (target "belongs to").
 * Self-referential FKs alias the subquery table so the correlation is valid.
 */
function relationshipWhere(q: string, target: SchemaTable, meta: SchemaMeta): string[] {
  const edges = meta.foreignKeys || [];
  if (edges.length === 0) return [];
  const tn = '"' + target.name + '"';
  const conds: string[] = [];
  const seen: { [k: string]: boolean } = {};
  const escRe = function (s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  const NUM = '(\\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|couple(?: of)?|few|several)';
  // name | singular alternation for a related table.
  const nameAlt = function (table: string) {
    const n = table.toLowerCase();
    const singular = singularize(n);
    return singular !== n ? escRe(n) + '|' + escRe(singular) : escRe(n);
  };

  const children = edges.filter(function (e) { return e.toTable === target.name; })
    .map(function (e) { return { table: e.fromTable, fkCol: e.fromColumn, pkCol: e.toColumn }; });
  const parents = edges.filter(function (e) { return e.fromTable === target.name; })
    .map(function (e) { return { table: e.toTable, fkCol: e.fromColumn, pkCol: e.toColumn }; });

  // --- children: count / existence of related rows pointing back at target ---
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (seen[c.table]) continue;
    const alt = nameAlt(c.table);
    if (!new RegExp('\\b(?:' + alt + ')\\b', 'i').test(q)) continue;
    // Self-FK needs an alias so "rel.fk = base.pk" isn't ambiguous.
    const selfRef = c.table === target.name;
    const from = selfRef ? '"' + c.table + '" AS rel' : '"' + c.table + '"';
    const al = selfRef ? 'rel' : '"' + c.table + '"';
    const corr = al + '."' + c.fkCol + '" = ' + tn + '."' + c.pkCol + '"';
    const countSub = '(SELECT COUNT(*) FROM ' + from + ' WHERE ' + corr + ')';
    const existsSub = 'EXISTS (SELECT 1 FROM ' + from + ' WHERE ' + corr + ')';
    const notExists = 'NOT EXISTS (SELECT 1 FROM ' + from + ' WHERE ' + corr + ')';
    const W = function (body: string) { return new RegExp(body, 'i'); };
    let m: RegExpMatchArray | null;
    // Order matters: count comparisons first, then negation, then existence,
    // then a bare exact DIGIT count. "with a/an/any/some/one … " means EXISTS
    // (has at least one) — checked before the exact-count branch so the "a" in
    // "with a phone" isn't read as the number 1 ("exactly one").
    if ((m = q.match(W('\\b(?:with|having)\\s+(?:more than|over)\\s+' + NUM + '\\s+(?:' + alt + ')\\b')))) {
      conds.push(countSub + ' > ' + numFromToken(m[1]));
    } else if ((m = q.match(W('\\b(?:with|having)\\s+at least\\s+' + NUM + '\\s+(?:' + alt + ')\\b')))) {
      conds.push(countSub + ' >= ' + numFromToken(m[1]));
    } else if (W('\\bwithout\\s+(?:any\\s+)?(?:' + alt + ')\\b').test(q)
      || W('\\b(?:with|having)\\s+no\\s+(?:' + alt + ')\\b').test(q)) {
      conds.push(notExists);
    } else if (W('\\b(?:with|having)\\s+(?:a|an|any|some|one|at least one|one or more)\\s+(?:' + alt + ')\\b').test(q)) {
      conds.push(existsSub);
    } else if ((m = q.match(W('\\b(?:with|having)\\s+(?:exactly\\s+)?(\\d+)\\s+(?:' + alt + ')\\b')))) {
      conds.push(countSub + ' = ' + m[1]);
    } else {
      continue;
    }
    seen[c.table] = true;
  }

  // --- parents: target's own FK column set / null / orphaned ---
  for (let i = 0; i < parents.length; i++) {
    const p = parents[i];
    if (seen[p.table]) continue;
    const alt = nameAlt(p.table);
    if (!new RegExp('\\b(?:' + alt + ')\\b', 'i').test(q)) continue;
    const fk = tn + '."' + p.fkCol + '"';
    const W = function (body: string) { return new RegExp(body, 'i'); };
    if (W('\\b(?:without|with no|having no|missing|no)\\s+(?:a |an )?(?:' + alt + ')\\b').test(q)
      || W('\\borphan(?:ed)?\\b').test(q)) {
      conds.push(fk + ' IS NULL');
      seen[p.table] = true;
    } else if (W('\\b(?:with|has|having|linked to|belongs? to|attached to|in)\\s+(?:a |an |its )?(?:' + alt + ')\\b').test(q)) {
      conds.push(fk + ' IS NOT NULL');
      seen[p.table] = true;
    }
  }

  // --- generic "relationship(s)" with no concrete table named ---
  // "Related rows" = the sum of all child tables' correlated counts, so
  // "more than one relationship" counts across every child type together.
  // EXISTS/NOT-EXISTS use an OR/AND across children for the same reason.
  if (children.length > 0 && conds.length === 0 && /\brelationship/i.test(q)) {
    const counts = children.map(function (c) {
      const corr = '"' + c.table + '"."' + c.fkCol + '" = ' + tn + '."' + c.pkCol + '"';
      return '(SELECT COUNT(*) FROM "' + c.table + '" WHERE ' + corr + ')';
    });
    const sum = counts.join(' + ');
    const anyExists = children.map(function (c) {
      const corr = '"' + c.table + '"."' + c.fkCol + '" = ' + tn + '."' + c.pkCol + '"';
      return 'EXISTS (SELECT 1 FROM "' + c.table + '" WHERE ' + corr + ')';
    }).join(' OR ');
    let m: RegExpMatchArray | null;
    if ((m = q.match(new RegExp('\\b(?:more than|over)\\s+' + NUM + '\\s+relationship', 'i')))) conds.push('(' + sum + ') > ' + numFromToken(m[1]));
    else if ((m = q.match(new RegExp('\\bat least\\s+' + NUM + '\\s+relationship', 'i')))) conds.push('(' + sum + ') >= ' + numFromToken(m[1]));
    else if (/\b(?:no|without|zero)\s+relationship/i.test(q)) conds.push('NOT (' + anyExists + ')');
    else if (/\b(?:a|any|some|with)\s+relationship/i.test(q)) conds.push('(' + anyExists + ')');
  }

  return conds;
}

/** "<noun>_id" / "<noun>Id" → the referenced noun ("contact_id" → "contact"); null for a bare "id". */
function idTargetNoun(colName: string): string | null {
  if (/^id$/i.test(colName)) return null;
  const m = colName.match(/^(.+?)_?id$/i);
  return m && m[1] ? m[1].replace(/_+$/, '') : null;
}

/**
 * Returns declared FK edges PLUS soft edges inferred from column naming, so
 * the wizard works on schemas that link by convention instead of declared
 * SQLite foreign keys (e.g. Saropa Contacts links every table by a shared
 * `contactSaropaUUID` and never calls `.references()`).
 *
 * Two conventions, both common:
 *  1. `<noun>_id` / `<noun>Id` → references the table whose singular name is
 *     <noun> ("phones.contact_id" → contacts).
 *  2. a shared `*UUID` identity column carried by several tables → the children
 *     reference the OWNER table whose singular name is embedded in the column
 *     name ("contact_points.contactSaropaUUID" → contacts, the owner of
 *     "contactSaropaUUID").
 *
 * Inferred edges are deduped against declared ones, so a schema that DOES
 * declare its FKs is unaffected (the same edge isn't added twice).
 */
export function inferForeignKeys(meta: SchemaMeta): ForeignKey[] {
  const tables = meta.tables || [];
  const edges: ForeignKey[] = (meta.foreignKeys || []).slice();
  const keyOf = function (e: ForeignKey) { return e.fromTable + '.' + e.fromColumn + '->' + e.toTable + '.' + e.toColumn; };
  const seen: { [k: string]: boolean } = {};
  edges.forEach(function (e) { seen[keyOf(e)] = true; });
  const add = function (fromTable: string, fromColumn: string, toTable: string, toColumn: string) {
    if (fromTable === toTable && fromColumn === toColumn) return; // not a self-identity edge
    const e = { fromTable: fromTable, fromColumn: fromColumn, toTable: toTable, toColumn: toColumn };
    if (!seen[keyOf(e)]) { seen[keyOf(e)] = true; edges.push(e); }
  };
  const pkOf = function (t: SchemaTable) {
    const pk = t.columns.find(function (c) { return c.pk; });
    return pk ? pk.name : 'id';
  };

  // Rule 1: <noun>_id / <noun>Id → table whose (singular) name is <noun>.
  for (let bi = 0; bi < tables.length; bi++) {
    const b = tables[bi];
    for (let ci = 0; ci < b.columns.length; ci++) {
      const noun = idTargetNoun(b.columns[ci].name);
      if (!noun) continue;
      const nl = noun.toLowerCase();
      const parent = tables.find(function (t) {
        const tn = t.name.toLowerCase();
        return tn === nl || singularize(tn) === nl || tn === nl + 's';
      });
      if (parent && parent.name !== b.name) add(b.name, b.columns[ci].name, parent.name, pkOf(parent));
    }
  }

  // Rule 2: a shared *UUID identity column → children reference its owner.
  const idCols: { [col: string]: string[] } = {};
  for (let bi = 0; bi < tables.length; bi++) {
    const b = tables[bi];
    for (let ci = 0; ci < b.columns.length; ci++) {
      const cn = b.columns[ci].name;
      if (!/uuid/i.test(cn)) continue;
      (idCols[cn] = idCols[cn] || []).push(b.name);
    }
  }
  for (const col in idCols) {
    const carriers = idCols[col];
    if (carriers.length < 2) continue;
    const colLower = col.toLowerCase();
    // Owner = carrier whose singular name is embedded in the column name; the
    // longest such match wins so "contacts"→"contact" beats a stray short hit.
    let owner: string | null = null;
    let ownerLen = 0;
    for (let i = 0; i < carriers.length; i++) {
      const s = singularize(carriers[i].toLowerCase());
      if (colLower.indexOf(s) >= 0 && s.length > ownerLen) { owner = carriers[i]; ownerLen = s.length; }
    }
    if (!owner) continue;
    for (let i = 0; i < carriers.length; i++) {
      if (carriers[i] !== owner) add(carriers[i], col, owner, col);
    }
  }
  return edges;
}

/**
 * Picks the "hub" table — the one most likely to be the subject of a query.
 * The entity others point at (contacts referenced by phones/emails/addresses)
 * is usually it, so rank by inbound FK count first, then row count, then name.
 * Falls back gracefully to row count / name when no FK metadata is loaded.
 */
function pickHubTable(cands: SchemaTable[], meta: SchemaMeta): SchemaTable {
  const fks = meta.foreignKeys || [];
  const inbound = function (t: SchemaTable): number {
    let n = 0;
    for (let i = 0; i < fks.length; i++) if (fks[i].toTable === t.name) n++;
    return n;
  };
  return cands.slice().sort(function (a, b) {
    const fa = inbound(a), fb = inbound(b);
    if (fb !== fa) return fb - fa;
    const ra = a.rowCount || 0, rb = b.rowCount || 0;
    if (rb !== ra) return rb - ra;
    return a.name.localeCompare(b.name);
  })[0];
}

interface ResolvedTable {
  table: SchemaTable;
  confidence: 'named' | 'only' | 'ambiguous' | 'guess';
  candidates: string[];
}

/**
 * Chooses the target table — and never dead-ends. If the question names a
 * table we use it; if several are named we pick the hub and flag it ambiguous;
 * if none is named we best-guess (the only table, else the hub) and flag it a
 * guess so the UI can surface a clarifier. The full candidate list rides along
 * so the dropdown can offer every table.
 */
function resolveTable(q: string, meta: SchemaMeta): ResolvedTable {
  const tables = meta.tables || [];
  const all = tables.map(function (t) { return t.name; });
  const esc = function (s: string) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  // Word-bounded name/singular match so "order" doesn't fire inside "reorder".
  const named = tables.filter(function (t) {
    const n = t.name.toLowerCase();
    const singular = singularize(n);
    return new RegExp('\\b' + esc(n) + '\\b', 'i').test(q)
      || (singular !== n && new RegExp('\\b' + esc(singular) + '\\b', 'i').test(q));
  });
  if (named.length === 1) return { table: named[0], confidence: 'named', candidates: all };
  if (named.length > 1) {
    // The subject is usually the table named FIRST ("phones with a contact"
    // → phones), so prefer the earliest mention over the hub here.
    const firstIndex = function (t: SchemaTable): number {
      const n = t.name.toLowerCase();
      const s = singularize(n);
      const i1 = q.search(new RegExp('\\b' + esc(n) + '\\b', 'i'));
      const i2 = s !== n ? q.search(new RegExp('\\b' + esc(s) + '\\b', 'i')) : -1;
      const found = [i1, i2].filter(function (x) { return x >= 0; });
      return found.length ? Math.min.apply(null, found) : 1e9;
    };
    const earliest = named.slice().sort(function (a, b) { return firstIndex(a) - firstIndex(b); })[0];
    return { table: earliest, confidence: 'ambiguous', candidates: named.map(function (t) { return t.name; }) };
  }
  if (tables.length === 1) return { table: tables[0], confidence: 'only', candidates: all };
  return { table: pickHubTable(tables, meta), confidence: 'guess', candidates: all };
}

export function nlToSql(question: string, meta: SchemaMeta, opts?: { table?: string }): NlResult {
  const q = question.toLowerCase().trim();
  const tables = meta.tables || [];
  if (tables.length === 0) return { sql: null, error: 'No tables in the schema to query.' };

  // Augment declared FKs with soft edges inferred from column naming so hub
  // detection and the relationship engine work on convention-linked schemas
  // (e.g. shared *UUID columns) that declare no SQLite foreign keys.
  meta = { tables: tables, foreignKeys: inferForeignKeys(meta) };

  // Resolve the table (best-guess, never a dead-end). An explicit override from
  // the clarifier dropdown wins and is treated as a named choice.
  let resolved = resolveTable(q, meta);
  if (opts && opts.table) {
    const forced = tables.find(function (t) { return t.name === opts.table; });
    if (forced) resolved = { table: forced, confidence: 'named', candidates: resolved.candidates };
  }
  const target = resolved.table;
  // Word-bounded so a short column name doesn't match inside a longer word —
  // e.g. "age" must not light up for "aver(age)", which would make
  // "average balance" pick AVG(age) instead of AVG(balance).
  const wb = function (s: string) { return new RegExp('\\b' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i'); };
  const mentioned = target.columns.filter(function (c) {
    const n = c.name.toLowerCase();
    return wb(n.replace(/_/g, ' ')).test(q) || wb(n).test(q);
  });
  const selectCols = mentioned.length > 0
    ? mentioned.map(function (c) { return '"' + c.name + '"'; }).join(', ')
    : '*';
  let sql = '';
  const tn = '"' + target.name + '"';
  // Shared WHERE: the temporal window ("changed today") AND any column
  // predicates ("status = active", "age > 30") combined with AND. Built once
  // so every branch filters consistently; sits after FROM, before ORDER/LIMIT.
  const conds: string[] = [];
  const tw = temporalWhere(q, target);
  if (tw) conds.push(tw);
  // valueWhere takes the original-case question so string values keep their case.
  const vw = valueWhere(question, target);
  for (let i = 0; i < vw.length; i++) conds.push(vw[i]);
  // FK-relationship predicates ("with more than one phone", "without orders").
  const rw = relationshipWhere(q, target, meta);
  for (let i = 0; i < rw.length; i++) conds.push(rw[i]);
  const where = conds.length ? ' WHERE ' + conds.join(' AND ') : '';

  // Ordering and row-cap apply to the row-returning branches; an explicit cap
  // ('top 10') becomes a LIMIT, otherwise the default select caps at 50.
  const order = orderClause(q, target);
  const lim = limitFrom(q);
  const limClause = lim != null ? ' LIMIT ' + lim : '';

  // A grouping phrase ("by country", "per status") routes to GROUP BY and must
  // win over the plain count branch ("count contacts by country" is a group,
  // not a scalar count). Sort phrases and top-N rankings are NOT grouping.
  const isGrouping =
    (/group(?:ed)?\s+by|grouped by|\bper\s+\w+|broken down by|broken out by|segment(?:ed)?\s+by|split by|bucketed by|categori[sz]ed by|\bcount(?:s|ed)?\s+by|tally|distribution|histogram|frequency|breakdown|\bby\s+\w+/i.test(q))
    && !/(?:order|sort)(?:ed)?\s+by/i.test(q)
    && !/\b(?:top|first|bottom|longest|shortest)\b/i.test(q);

  const numericCol = function () {
    return mentioned.find(function (c) { return /int|real|num|float|double|dec/i.test(c.type); }) ||
      target.columns.find(function (c) { return /int|real|num|float|double|dec/i.test(c.type); });
  };

  if (/how many|\bcount\b|total number|number of/i.test(q) && !isGrouping) {
    sql = 'SELECT COUNT(*) FROM ' + tn + where;
  } else if (/duplicate|repeated|dupe/i.test(q)) {
    // Rows sharing a value — the classic "find duplicate emails" check. Prefer
    // the column the user named after "duplicate" (matchColumn handles the
    // plural, e.g. "emails" → the email column) over any mention or fallback.
    const dupWord = q.match(/(?:duplicate|repeated|dupe)d?\s+([a-z0-9_]+)/i);
    const col = (dupWord && matchColumn(dupWord[1], target)) || mentioned[0] ||
      target.columns.find(function (c) { return /name|email|title|slug|code/i.test(c.name); }) ||
      target.columns[1] || target.columns[0];
    sql = 'SELECT "' + col.name + '", COUNT(*) AS count FROM ' + tn + where +
      ' GROUP BY "' + col.name + '" HAVING count > 1 ORDER BY count DESC' + limClause;
  } else if (/average|avg|\bmean\b|typical|on average/i.test(q)) {
    const numCol = numericCol();
    sql = numCol ? 'SELECT AVG("' + numCol.name + '") FROM ' + tn + where : 'SELECT * FROM ' + tn + where + ' LIMIT 50';
  } else if (/sum|total\b|altogether|combined|grand total|aggregate/i.test(q) && !/total number/i.test(q)) {
    const numCol = numericCol();
    sql = numCol ? 'SELECT SUM("' + numCol.name + '") FROM ' + tn + where : 'SELECT * FROM ' + tn + where + ' LIMIT 50';
  } else if (/max|maximum|highest|largest|biggest|peak|topmost/i.test(q)) {
    const numCol = numericCol();
    sql = numCol ? 'SELECT MAX("' + numCol.name + '") FROM ' + tn + where : 'SELECT * FROM ' + tn + where + ' ORDER BY 1 DESC LIMIT 1';
    // Word-bound "min" so a temporal "… minutes" phrase doesn't trip the
    // MIN aggregate (the substring "min" lives inside "minutes").
  } else if (/\bmin\b|minimum|lowest|smallest/i.test(q)) {
    const numCol = numericCol();
    sql = numCol ? 'SELECT MIN("' + numCol.name + '") FROM ' + tn + where : 'SELECT * FROM ' + tn + where + ' ORDER BY 1 ASC LIMIT 1';
  } else if (/distinct|unique/i.test(q)) {
    const col = mentioned[0] || target.columns[1] || target.columns[0];
    // No ORDER BY here: with DISTINCT, SQLite rejects an ORDER BY on a column
    // outside the (single-column) result set.
    sql = 'SELECT DISTINCT "' + col.name + '" FROM ' + tn + where + limClause;
  } else if (/latest|newest|most recent|last (\d+)/i.test(q)) {
    const dateCol = target.columns.find(function (c) { return /date|time|created|updated/i.test(c.name); });
    const match = q.match(/last (\d+)/i);
    const rowLim = lim != null ? lim : (match ? parseInt(match[1], 10) : 10);
    sql = 'SELECT ' + selectCols + ' FROM ' + tn + where + (dateCol ? ' ORDER BY "' + dateCol.name + '" DESC' : '') + ' LIMIT ' + rowLim;
  } else if (/oldest|earliest|first (\d+)/i.test(q)) {
    const dateCol = target.columns.find(function (c) { return /date|time|created|updated/i.test(c.name); });
    const match2 = q.match(/first (\d+)/i);
    const rowLim = lim != null ? lim : (match2 ? parseInt(match2[1], 10) : 10);
    sql = 'SELECT ' + selectCols + ' FROM ' + tn + where + (dateCol ? ' ORDER BY "' + dateCol.name + '" ASC' : '') + ' LIMIT ' + rowLim;
    // Grouping: explicit "group by / per X / by X / breakdown" (computed above
    // as isGrouping, which already excludes sort phrases and top-N rankings).
  } else if (isGrouping) {
    // The group column comes from "by X" OR "per X" ("contacts per company").
    const byMatch = q.match(/\b(?:by|per)\s+([a-z0-9_]+)/i);
    const groupCol = (byMatch && matchColumn(byMatch[1], target)) || mentioned[0] || target.columns[1] || target.columns[0];
    sql = 'SELECT "' + groupCol.name + '", COUNT(*) AS count FROM ' + tn + where + ' GROUP BY "' + groupCol.name + '" ORDER BY count DESC' + limClause;
  } else {
    sql = 'SELECT ' + selectCols + ' FROM ' + tn + where + order + ' LIMIT ' + (lim != null ? lim : 50);
  }
  return { sql: sql, table: target.name, confidence: resolved.confidence, candidates: resolved.candidates };
}
