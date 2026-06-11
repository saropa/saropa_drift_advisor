/**
 * Extensive unit tests for the web viewer's NL→SQL converter (nl-to-sql.ts).
 *
 * Coverage: table resolution (best-guess / override / ambiguity), aggregates,
 * temporal windows, value predicates, ordering & limits, grouping, FK
 * relationship predicates, the real (no-FK, camelCase) Saropa Contacts shape,
 * SQL-injection / wildcard safety, predicate composition, and a broad
 * execute-against-SQLite smoke sweep.
 *
 * Run: `npm run test:web`  (node --test).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadModule, runCount } from './helpers.mjs';
import { relational, contactsApp } from './fixtures.mjs';

const mod = await loadModule();
const nlToSql = mod.nlToSql;
const isDateColumn = mod.isDateColumn;
const rel = relational.meta;
const app = contactsApp.meta;

// Convenience: the SQL string for a question against a fixture's metadata.
const S = (q, meta = rel, opts) => nlToSql(q, meta, opts).sql;
const relRun = (q, opts) => runCount(relational, S(q, rel, opts));
const appRun = (q, opts) => runCount(contactsApp, S(q, app, opts));

// ─────────────────────────────────────────────────────────────────────────
describe('table resolution', () => {
  it('uses a named table', () => {
    const r = nlToSql('how many phones are there', rel);
    assert.equal(r.table, 'phones');
    assert.equal(r.confidence, 'named');
  });

  it('matches a singular table name', () => {
    assert.equal(nlToSql('show every company', rel).table, 'companies');
  });

  it('best-guesses the hub table (most inbound FKs) when none is named', () => {
    const r = nlToSql('search for alice', rel);
    assert.equal(r.table, 'contacts'); // contacts is referenced by phones + self-FK
    assert.equal(r.confidence, 'guess');
    assert.deepEqual([...r.candidates].sort(), ['companies', 'contacts', 'phones']);
  });

  it('never dead-ends: always returns SQL for an unnamed table', () => {
    assert.ok(S('find everyone called alice') !== null);
  });

  it('on ambiguity prefers the earliest-mentioned table (the subject)', () => {
    assert.equal(nlToSql('phones with a contact', rel).table, 'phones');
  });

  it('honors an explicit table override (clarifier dropdown)', () => {
    const r = nlToSql('search for alice', rel, { table: 'companies' });
    assert.equal(r.table, 'companies');
    assert.equal(r.confidence, 'named');
    assert.match(r.sql, /FROM "companies"/);
  });

  it('single-table schema resolves with confidence "only"', () => {
    const one = { tables: [rel.tables[2]] };
    assert.equal(nlToSql('how many', one).confidence, 'only');
  });

  it('empty schema returns an error, not a crash', () => {
    const r = nlToSql('anything', { tables: [] });
    assert.equal(r.sql, null);
    assert.match(r.error, /no tables/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('aggregates', () => {
  it('count', () => assert.match(S('how many contacts'), /SELECT COUNT\(\*\) FROM "contacts"/));
  it('count via "number of"', () => assert.match(S('number of contacts'), /COUNT\(\*\)/));
  it('average', () => assert.match(S('average balance'), /AVG\("balance"\)/));
  it('average synonym "typical"', () => assert.match(S('typical age'), /AVG\("age"\)/));
  it('sum', () => assert.match(S('total balance'), /SUM\("balance"\)/));
  it('sum synonym "combined"', () => assert.match(S('combined balance'), /SUM\("balance"\)/));
  it('max', () => assert.match(S('highest age'), /MAX\("age"\)/));
  it('max synonym "peak"', () => assert.match(S('peak balance'), /MAX\("balance"\)/));
  it('min', () => assert.match(S('lowest age'), /MIN\("age"\)/));
  it('distinct', () => assert.match(S('distinct status'), /SELECT DISTINCT "status"/));

  it('does not match a column name inside a longer word (age ⊄ average)', () => {
    assert.match(S('average balance'), /AVG\("balance"\)/);
    assert.doesNotMatch(S('average balance'), /AVG\("age"\)/);
  });

  it('duplicate finder groups + HAVING > 1', () => {
    assert.match(S('duplicate emails'), /GROUP BY "email" HAVING count > 1/);
    assert.equal(relRun('duplicate emails'), 1); // alice@gmail.com appears twice
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('temporal windows', () => {
  it('today → equality on the local day', () => {
    assert.match(S('contacts changed today'),
      /date\("updated_at", 'unixepoch', 'localtime'\) = date\('now', 'localtime'\)/);
    assert.equal(relRun('contacts changed today'), 1); // only Alice updated today
  });

  it('"changed" picks the updated column, "created" picks the created column', () => {
    assert.match(S('contacts changed today'), /"updated_at"/);
    assert.match(S('contacts created today'), /"created_at"/);
  });

  it('staleness "not updated in 30 days" → older-than (<) predicate', () => {
    const sql = S('contacts not updated in 30 days');
    assert.match(sql, /date\("updated_at", 'unixepoch', 'localtime'\) < date\('now', '-30 days', 'localtime'\)/);
    assert.equal(relRun('contacts not updated in 30 days'), 2); // Bob(100d), Dave(40d)
  });

  it('"older than 60 days" → older-than predicate', () => {
    assert.match(S('contacts older than 60 days'), /< date\('now', '-60 days'/);
    assert.equal(relRun('contacts older than 60 days'), 1); // Bob(100d) only
  });

  it('dormant / stale (no number) → 30-day default', () => {
    assert.match(S('dormant contacts'), /< date\('now', '-30 days'/);
  });

  it('compact token 24h → datetime hour window', () => {
    assert.match(S('contacts updated 24h'), /datetime\("updated_at".*-24 hours/);
  });

  it('named year → literal year bounds', () => {
    assert.match(S('contacts created in 2020'), /'2020-01-01'.* < .*'2021-01-01'/);
    assert.equal(relRun('contacts created in 2020'), 0); // all seeded recent
  });

  it('quarter Q1 → start-of-year derived range', () => {
    assert.match(S('contacts changed in q1'), /start of year/);
  });

  it('this week / month / year all execute', () => {
    for (const q of ['contacts changed this week', 'contacts changed this month', 'contacts changed this year']) {
      assert.ok(relRun(q) >= 0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('value predicates', () => {
  it('greater-than', () => {
    assert.match(S('contacts where age > 30'), /"age" > 30/);
    assert.equal(relRun('contacts where age > 30'), 2); // Alice 34, Carol 40
  });
  it('at least', () => {
    assert.match(S('contacts age at least 18'), /"age" >= 18/);
    assert.equal(relRun('contacts age at least 18'), 3); // not Dave (17)
  });
  it('between', () => {
    assert.match(S('contacts age between 18 and 35'), /"age" BETWEEN 18 AND 35/);
    assert.equal(relRun('contacts age between 18 and 35'), 2); // Alice 34, Bob 22
  });
  it('equality is COLLATE NOCASE + preserves value case', () => {
    assert.match(S('contacts where status = ACTIVE'), /"status" = 'ACTIVE' COLLATE NOCASE/);
    assert.equal(relRun('contacts where status = ACTIVE'), 2); // matches stored 'active'
  });
  it('negated equality', () => {
    assert.match(S('contacts where status is not active'), /"status" != 'active' COLLATE NOCASE/);
    assert.equal(relRun('contacts where status is not active'), 2);
  });
  it('contains → LIKE %v% (escaped)', () => {
    assert.match(S('contacts email contains gmail'), /"email" LIKE '%gmail%' ESCAPE/);
    assert.equal(relRun('contacts email contains gmail'), 2);
  });
  it('starts with / ends with', () => {
    assert.match(S('contacts name starts with a'), /"name" LIKE 'a%'/);
    assert.match(S('contacts email ends with .com'), /"email" LIKE '%\.com'/);
    assert.equal(relRun('contacts email ends with .com'), 3); // Dave has null email
  });
  it('null / empty', () => {
    assert.match(S('contacts with no email'), /\("email" IS NULL OR "email" = ''\)/);
    assert.equal(relRun('contacts with no email'), 1); // Dave
  });
  it('presence', () => {
    assert.match(S('contacts that have an email'), /\("email" IS NOT NULL AND "email" != ''\)/);
    assert.equal(relRun('contacts that have an email'), 3);
  });
  it('boolean flag on/off', () => {
    assert.match(S('active contacts'), /"active" = 1/);
    assert.equal(relRun('active contacts'), 3);
    assert.match(S('inactive contacts'), /"active" = 0/);
    assert.equal(relRun('inactive contacts'), 1); // Bob
  });
  it('boolean via "is true"', () => assert.match(S('contacts where active is true'), /"active" = 1/));
  it('unsubscribed flag', () => {
    assert.match(S('unsubscribed contacts'), /"subscribed" = 0/);
    assert.equal(relRun('unsubscribed contacts'), 2);
  });
  it('sign checks', () => {
    assert.match(S('contacts with negative balance'), /"balance" < 0/);
    assert.equal(relRun('contacts with negative balance'), 1); // Bob
    assert.match(S('contacts with zero balance'), /"balance" = 0/);
    assert.equal(relRun('contacts with zero balance'), 1); // Dave
  });
  it('named / search verb → fuzzy name match', () => {
    assert.match(S('contacts named alice'), /"name" LIKE '%alice%'/);
    assert.equal(relRun('contacts named alice'), 1); // Alice Smith
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('ordering & limit', () => {
  it('explicit sort with direction', () => assert.match(S('contacts sorted by age desc'), /ORDER BY "age" DESC/));
  it('explicit sort default asc', () => assert.match(S('contacts order by name'), /ORDER BY "name" ASC/));
  it('alphabetical → text column asc', () => assert.match(S('alphabetical contacts'), /ORDER BY "name" ASC/));
  it('newest first → date column desc', () => assert.match(S('contacts newest first'), /ORDER BY "created_at" DESC/));
  it('longest → ORDER BY LENGTH', () => assert.match(S('longest name in contacts'), /ORDER BY LENGTH\("name"\) DESC/));
  it('top N by col → order + limit, not grouping', () => {
    assert.match(S('top 2 contacts by balance'), /ORDER BY "balance" DESC LIMIT 2/);
    assert.equal(relRun('top 2 contacts by balance'), 2);
  });
  it('show N → limit', () => assert.match(S('show 3 contacts'), /LIMIT 3/));
});

// ─────────────────────────────────────────────────────────────────────────
describe('grouping', () => {
  it('count by X', () => {
    assert.match(S('count contacts by status'),
      /SELECT "status", COUNT\(\*\) AS count FROM "contacts" GROUP BY "status" ORDER BY count DESC/);
    assert.equal(relRun('count contacts by status'), 3); // active, pending, closed
  });
  it('per X resolves the group column', () => assert.match(S('contacts per company'), /GROUP BY "company_id"/));
  it('"count ... by" wins over the plain count branch', () =>
    assert.doesNotMatch(S('count contacts by status'), /^SELECT COUNT\(\*\)/));
});

// ─────────────────────────────────────────────────────────────────────────
describe('FK relationship engine', () => {
  it('with more than one <child> → correlated COUNT > 1', () => {
    assert.match(S('contacts with more than one phone'),
      /\(SELECT COUNT\(\*\) FROM "phones" WHERE "phones"\."contact_id" = "contacts"\."id"\) > 1/);
    assert.equal(relRun('contacts with more than one phone'), 1); // Alice (3)
  });
  it('with at least N <child>', () => {
    assert.match(S('contacts with at least 2 phones'), /\) >= 2/);
    assert.equal(relRun('contacts with at least 2 phones'), 1);
  });
  it('without any <child> → NOT EXISTS', () => {
    assert.match(S('contacts without any phones'), /NOT EXISTS \(SELECT 1 FROM "phones"/);
    assert.equal(relRun('contacts without any phones'), 1); // Dave
  });
  it('with a <child> → EXISTS', () => {
    assert.match(S('contacts with a phone'), /EXISTS \(SELECT 1 FROM "phones"/);
    assert.equal(relRun('contacts with a phone'), 3);
  });
  it('belongs to a <parent> → FK IS NOT NULL', () => {
    assert.match(S('contacts that belong to a company'), /"contacts"\."company_id" IS NOT NULL/);
    assert.equal(relRun('contacts that belong to a company'), 2);
  });
  it('with no <parent> → FK IS NULL', () => {
    assert.match(S('contacts with no company'), /"contacts"\."company_id" IS NULL/);
    assert.equal(relRun('contacts with no company'), 2);
  });
  it('generic "relationship" sums across all child tables', () => {
    const sql = S('contacts with more than one relationship');
    assert.match(sql, /\) \+ \(SELECT COUNT/); // phones + self-managed contacts
    assert.equal(relRun('contacts with more than one relationship'), 1); // Alice
  });
  it('composition: a flag AND a relationship', () => {
    const sql = S('active contacts with more than one phone');
    assert.match(sql, /"active" = 1/);
    assert.match(sql, /\) > 1/);
    assert.equal(relRun('active contacts with more than one phone'), 1); // Alice
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('real Saropa Contacts shape (UUID links, camelCase, no FKs)', () => {
  it('resolves real table names', () => {
    assert.equal(nlToSql('how many organizations', app).table, 'organizations');
    assert.match(S('how many organizations', app), /COUNT\(\*\) FROM "organizations"/);
  });
  it('fuzzy name match lands on a camelCase name column', () => {
    assert.match(S('contacts named alice', app), /"givenName" LIKE '%alice%'/);
    assert.equal(appRun('contacts named alice'), 1);
  });
  it('camelCase createdAt / updatedAt ARE detected as date columns', () => {
    assert.match(S('contacts created this week', app), /date\("createdAt"/);
    assert.match(S('contacts changed today', app), /date\("updatedAt"/);
    assert.equal(appRun('contacts changed today'), 1); // Alice updated today
  });
  it('boolean count still works on a real table', () => {
    assert.match(S('how many contacts', app), /COUNT\(\*\) FROM "contacts"/);
  });
  it('soft-FK inference: hub becomes contacts via shared *UUID columns', () => {
    // contact_points + connections both carry contactSaropaUUID, so contacts
    // (its owner) gains the most inbound soft edges and wins the hub guess —
    // no longer the biggest-by-rowcount detail table.
    const r = nlToSql('search for alice', app);
    assert.equal(r.confidence, 'guess');
    assert.equal(r.table, 'contacts');
    assert.match(r.sql, /"givenName" LIKE '%alice%'/);
  });
  it('soft-FK inference: relationship phrases work on UUID-linked tables', () => {
    const sql = S('contacts with more than one connection', app);
    assert.match(sql,
      /\(SELECT COUNT\(\*\) FROM "connections" WHERE "connections"\."contactSaropaUUID" = "contacts"\."contactSaropaUUID"\) > 1/);
    assert.ok(appRun('contacts with more than one connection') >= 0);
  });
  it('soft-FK inference adds no spurious edges to a declared-FK schema', () => {
    // The relational fixture's FK behavior is unchanged (Rule 1 edges dedupe
    // against the declared ones; Rule 2 finds no *UUID columns).
    assert.equal(relRun('contacts with more than one phone'), 1);
    assert.equal(relRun('contacts without any phones'), 1);
  });
  it('camelCase *At columns (favoriteAt) ARE now detected as date columns', () => {
    assert.equal(isDateColumn({ name: 'favoriteAt', type: 'INTEGER' }), true);
    assert.equal(isDateColumn({ name: 'emergencyAt', type: 'INTEGER' }), true);
    assert.equal(isDateColumn({ name: 'eventDate', type: 'INTEGER' }), true);
  });
});

describe('date-column detection (type + camelCase, not just name)', () => {
  it('a declared temporal TYPE is detected regardless of column name', () => {
    assert.equal(isDateColumn({ name: 'whenever', type: 'DATETIME' }), true);
    assert.equal(isDateColumn({ name: 'x', type: 'TIMESTAMP' }), true);
    const meta = { tables: [{ name: 'logs', rowCount: 1, columns: [
      { name: 'id', type: 'INTEGER', pk: true }, { name: 'whenever', type: 'DATETIME' },
    ] }] };
    assert.match(nlToSql('logs changed today', meta).sql, /date\("whenever"/);
  });
  it('does NOT flag bool/status/count columns (would break "newest first")', () => {
    assert.equal(isDateColumn({ name: 'isActive', type: 'INTEGER' }), false);
    assert.equal(isDateColumn({ name: 'status', type: 'TEXT' }), false);
    assert.equal(isDateColumn({ name: 'age', type: 'INTEGER' }), false);
    assert.equal(isDateColumn({ name: 'format', type: 'TEXT' }), false); // not a camelCase *At
  });
  it('"newest first" prefers a created/updated column over an arbitrary date col', () => {
    // contacts lists favoriteAt before createdAt; recency must still pick createdAt.
    assert.match(S('contacts newest first', app), /ORDER BY "createdAt" DESC/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('safety: escaping', () => {
  // Values must be QUOTED in the question to carry special characters — an
  // unquoted token stops at the first non-word char by design.
  it('single quotes in a value are doubled', () => {
    assert.match(S('contacts where name = "o\'brien"'), /'o''brien'/);
    assert.ok(relRun('contacts where name = "o\'brien"') >= 0);
  });
  it('LIKE wildcards in a value are escaped', () => {
    const sql = S('contacts email contains "50%"');
    assert.match(sql, /ESCAPE '\\'/);
    assert.match(sql, /50\\%/);
  });
  it('an injection-looking value stays one quoted literal (no extra statements)', () => {
    const sql = S('contacts where status = "x\'; DROP TABLE contacts; --"');
    // The quote is doubled, so the whole thing is a single string literal.
    assert.match(sql, /= 'x''; DROP TABLE contacts; --' COLLATE NOCASE/);
    assert.ok(relRun('contacts where status = "x\'; DROP TABLE contacts; --"') >= 0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
describe('broad execution sweep: every generated query runs in SQLite', () => {
  const phrases = [
    'how many contacts', 'average balance', 'total balance', 'highest age', 'lowest balance',
    'distinct status', 'duplicate emails', 'contacts where age > 30', 'contacts age between 18 and 65',
    'contacts where status = active', 'contacts where status is not closed', 'active contacts',
    'inactive contacts', 'unsubscribed contacts', 'contacts with negative balance',
    'contacts with no email', 'contacts that have an email', 'contacts email contains gmail',
    'contacts name starts with a', 'contacts named alice', 'search for alice',
    'contacts changed today', 'contacts created yesterday', 'contacts changed this week',
    'contacts updated in the last 7 days', 'contacts not updated in 30 days', 'dormant contacts',
    'contacts older than 60 days', 'contacts changed in q1', 'contacts created in 2020',
    'top 5 contacts by balance', 'contacts sorted by name desc', 'alphabetical contacts',
    'contacts newest first', 'show 10 contacts', 'count contacts by status', 'contacts per company',
    'contacts with more than one phone', 'contacts without any phones', 'contacts with a phone',
    'contacts that belong to a company', 'contacts with no company',
    'active contacts with more than one phone created this week sorted by name',
  ];
  for (const q of phrases) {
    it(`runs: ${q}`, () => {
      const sql = S(q);
      assert.ok(typeof sql === 'string' && sql.length > 0, 'produced SQL');
      assert.ok(runCount(relational, sql) >= 0, 'executed without error');
    });
  }
});
