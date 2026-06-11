/**
 * Schema fixtures for the NL→SQL tests.
 *
 * Two shapes, both grounded in real Saropa data models:
 *
 * - `relational`: a normalized schema with declared INTEGER foreign keys
 *   (contacts → companies, phones → contacts, contacts.manager_id → contacts
 *   self-ref). Drives the FK relationship engine.
 *
 * - `contactsApp`: modeled on the actual Saropa Contacts Drift schema
 *   (D:/src/contacts/lib/database/drift). That schema links rows by UUID
 *   columns, NOT declared SQLite foreign keys, and uses camelCase names
 *   (givenName, favoriteAt, lastModified). So `foreignKeys` is empty here —
 *   exercising the no-FK path and real-world column naming.
 *
 * Each fixture carries `meta` (passed to nlToSql), `ddl` (CREATE statements),
 * and `seed(db, now)` so generated SQL can be executed against real SQLite.
 */

// ---- relational (declared FKs) ----

export const relational = {
  meta: {
    tables: [
      {
        name: 'companies',
        rowCount: 2,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true, notnull: true },
          { name: 'name', type: 'TEXT' },
          { name: 'founded', type: 'INTEGER' },
        ],
      },
      {
        name: 'contacts',
        rowCount: 4,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true, notnull: true },
          { name: 'name', type: 'TEXT' },
          { name: 'email', type: 'TEXT' },
          { name: 'age', type: 'INTEGER' },
          { name: 'balance', type: 'REAL' },
          { name: 'status', type: 'TEXT' },
          { name: 'active', type: 'INTEGER' },
          { name: 'subscribed', type: 'INTEGER' },
          { name: 'company_id', type: 'INTEGER' },
          { name: 'manager_id', type: 'INTEGER' },
          { name: 'created_at', type: 'INTEGER' },
          { name: 'updated_at', type: 'INTEGER' },
        ],
      },
      {
        name: 'phones',
        rowCount: 5,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true, notnull: true },
          { name: 'contact_id', type: 'INTEGER' },
          { name: 'number', type: 'TEXT' },
          { name: 'kind', type: 'TEXT' },
        ],
      },
    ],
    foreignKeys: [
      { fromTable: 'phones', fromColumn: 'contact_id', toTable: 'contacts', toColumn: 'id' },
      { fromTable: 'contacts', fromColumn: 'company_id', toTable: 'companies', toColumn: 'id' },
      { fromTable: 'contacts', fromColumn: 'manager_id', toTable: 'contacts', toColumn: 'id' },
    ],
  },
  ddl: [
    'CREATE TABLE companies(id INTEGER PRIMARY KEY, name TEXT, founded INTEGER)',
    'CREATE TABLE contacts(id INTEGER PRIMARY KEY, name TEXT, email TEXT, age INTEGER, balance REAL, status TEXT, active INTEGER, subscribed INTEGER, company_id INTEGER, manager_id INTEGER, created_at INTEGER, updated_at INTEGER)',
    'CREATE TABLE phones(id INTEGER PRIMARY KEY, contact_id INTEGER, number TEXT, kind TEXT)',
  ],
  seed(db, now) {
    const D = 86400;
    db.exec("INSERT INTO companies VALUES (1,'Acme',1990),(2,'Globex',2001)");
    const ins = db.prepare('INSERT INTO contacts VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
    // id,name,email,age,balance,status,active,subscribed,company_id,manager_id,created_at,updated_at
    ins.run(1, 'Alice Smith', 'alice@gmail.com', 34, 1200.5, 'active', 1, 1, 1, null, now, now);
    ins.run(2, 'Bob Jones', 'bob@yahoo.com', 22, -5, 'pending', 0, 0, null, 1, now - 100 * D, now - 100 * D);
    ins.run(3, 'Carol White', 'alice@gmail.com', 40, 300, 'active', 1, 1, 2, 1, now - 2 * D, now - 2 * D);
    ins.run(4, 'Dave Black', null, 17, 0, 'closed', 1, 0, null, null, now - 40 * D, now - 40 * D);
    db.exec("INSERT INTO phones VALUES (1,1,'111','mobile'),(2,1,'222','home'),(3,1,'333','work'),(4,3,'444','mobile'),(5,2,'555','mobile')");
  },
};

// ---- contactsApp (real Saropa Contacts shape; UUID links, no SQLite FKs) ----

export const contactsApp = {
  meta: {
    tables: [
      {
        name: 'contacts',
        rowCount: 5000,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true, notnull: true },
          { name: 'version', type: 'INTEGER' },
          { name: 'contactSaropaUUID', type: 'TEXT' },
          { name: 'givenName', type: 'TEXT' },
          { name: 'middleName', type: 'TEXT' },
          { name: 'familyName', type: 'TEXT' },
          { name: 'nicknames', type: 'TEXT' },
          { name: 'avatarUrl', type: 'TEXT' },
          { name: 'isNicknameOnly', type: 'INTEGER' },
          { name: 'hasCustomRingtone', type: 'INTEGER' },
          { name: 'favoriteAt', type: 'INTEGER' },
          { name: 'emergencyAt', type: 'INTEGER' },
          { name: 'followUpAt', type: 'INTEGER' },
          { name: 'createdAt', type: 'INTEGER' },
          { name: 'updatedAt', type: 'INTEGER' },
        ],
      },
      {
        name: 'contact_points',
        rowCount: 12000,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true, notnull: true },
          { name: 'contactSaropaUUID', type: 'TEXT' },
          { name: 'points', type: 'INTEGER' },
          { name: 'createdAt', type: 'INTEGER' },
          { name: 'lastModified', type: 'INTEGER' },
        ],
      },
      {
        name: 'organizations',
        rowCount: 300,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true, notnull: true },
          { name: 'organizationName', type: 'TEXT' },
          { name: 'industry', type: 'TEXT' },
          { name: 'tickerSymbol', type: 'TEXT' },
          { name: 'description', type: 'TEXT' },
          { name: 'createdAt', type: 'INTEGER' },
        ],
      },
      {
        name: 'calendar_events',
        rowCount: 800,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true, notnull: true },
          { name: 'type', type: 'TEXT' },
          { name: 'eventStart', type: 'INTEGER' },
          { name: 'eventEnd', type: 'INTEGER' },
          { name: 'location', type: 'TEXT' },
          { name: 'locationLatitude', type: 'REAL' },
          { name: 'createdAt', type: 'INTEGER' },
          { name: 'lastModified', type: 'INTEGER' },
        ],
      },
      {
        name: 'connections',
        rowCount: 400,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true, notnull: true },
          { name: 'contactSaropaUUID', type: 'TEXT' },
          { name: 'emailAddress', type: 'TEXT' },
          { name: 'createdAt', type: 'INTEGER' },
          { name: 'lastSharedAt', type: 'INTEGER' },
        ],
      },
    ],
    foreignKeys: [], // UUID-linked, no declared SQLite foreign keys
  },
  ddl: [
    'CREATE TABLE contacts(id INTEGER PRIMARY KEY, version INTEGER, contactSaropaUUID TEXT, givenName TEXT, middleName TEXT, familyName TEXT, nicknames TEXT, avatarUrl TEXT, isNicknameOnly INTEGER, hasCustomRingtone INTEGER, favoriteAt INTEGER, emergencyAt INTEGER, followUpAt INTEGER, createdAt INTEGER, updatedAt INTEGER)',
    'CREATE TABLE contact_points(id INTEGER PRIMARY KEY, contactSaropaUUID TEXT, points INTEGER, createdAt INTEGER, lastModified INTEGER)',
    'CREATE TABLE organizations(id INTEGER PRIMARY KEY, organizationName TEXT, industry TEXT, tickerSymbol TEXT, description TEXT, createdAt INTEGER)',
    'CREATE TABLE calendar_events(id INTEGER PRIMARY KEY, type TEXT, eventStart INTEGER, eventEnd INTEGER, location TEXT, locationLatitude REAL, createdAt INTEGER, lastModified INTEGER)',
    'CREATE TABLE connections(id INTEGER PRIMARY KEY, contactSaropaUUID TEXT, emailAddress TEXT, createdAt INTEGER, lastSharedAt INTEGER)',
  ],
  seed(db, now) {
    const D = 86400;
    const c = db.prepare('INSERT INTO contacts (id,givenName,familyName,nicknames,isNicknameOnly,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?)');
    c.run(1, 'Alice', 'Smith', 'Ali', 0, now, now);
    c.run(2, 'Bob', 'Jones', null, 1, now - 100 * D, now - 100 * D);
    c.run(3, 'Carol', 'White', null, 0, now - 2 * D, now - 2 * D);
    db.exec("INSERT INTO organizations (id,organizationName,industry) VALUES (1,'Acme','Tech'),(2,'Globex','Finance')");
    db.exec('INSERT INTO contact_points (id,points,createdAt) VALUES (1,5,' + now + '),(2,3,' + (now - 50 * D) + ')');
  },
};
