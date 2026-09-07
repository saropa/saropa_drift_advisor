/**
 * Tests for isDriftProject — determines whether a pubspec.yaml declares
 * a Drift dependency.
 *
 * Extracted from dart-parser-tables.test.ts because isDriftProject lives
 * in the diagnostics layer (dart-file-parser), not the schema-diff layer.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import { Uri, workspace } from './vscode-mock';
import { isDriftProject, parseDateTimeAsText, RAW_SQL_CALL, workspaceUsesDrift } from '../diagnostics/dart-file-parser';
import { dartToSqlType } from '../schema-diff/dart-schema';

describe('isDriftProject', () => {
  it('should detect drift dependency', () => {
    const pubspec = 'dependencies:\n  drift: ^2.14.0\n';
    assert.strictEqual(isDriftProject(pubspec), true);
  });

  it('should detect saropa_drift_advisor dependency', () => {
    const pubspec = 'dev_dependencies:\n  saropa_drift_advisor: ^2.17.0\n';
    assert.strictEqual(isDriftProject(pubspec), true);
  });

  it('should return false for non-Drift projects', () => {
    const pubspec = 'dependencies:\n  flutter:\n    sdk: flutter\n  provider: ^6.0.0\n';
    assert.strictEqual(isDriftProject(pubspec), false);
  });

  it('should not match drift_dev or drift_sqflite alone', () => {
    // /\bdrift\s*:/ requires `drift` followed by optional whitespace then `:`.
    // In `drift_dev:`, after `drift` comes `_` — not whitespace or `:` — so
    // having only drift_dev does not make this a Drift project.
    const pubspec = 'dev_dependencies:\n  drift_dev: ^2.14.0\n';
    assert.strictEqual(isDriftProject(pubspec), false);
  });

  it('should return false for empty pubspec', () => {
    assert.strictEqual(isDriftProject(''), false);
  });
});

// Guards the regex that widens the file-inclusion gate so DAO/repository
// files with raw SQL (but no table classes) are included in diagnostic scans.
describe('RAW_SQL_CALL', () => {
  it('matches customSelect with opening paren', () => {
    assert.ok(RAW_SQL_CALL.test("customSelect('SELECT id FROM t')"));
  });

  it('matches customStatement with opening paren', () => {
    assert.ok(RAW_SQL_CALL.test("customStatement('INSERT INTO t VALUES(1)')"));
  });

  it('matches with whitespace before paren', () => {
    assert.ok(RAW_SQL_CALL.test("customSelect  ('SELECT 1')"));
  });

  it('does not match unrelated identifiers containing the word', () => {
    // "myCustomSelect" has no word boundary before "customSelect"
    assert.strictEqual(RAW_SQL_CALL.test('myCustomSelect()'), false);
  });

  it('does not match when there is no opening paren', () => {
    assert.strictEqual(RAW_SQL_CALL.test('customSelect'), false);
  });

  it('does not match plain select/insert strings', () => {
    assert.strictEqual(RAW_SQL_CALL.test("'SELECT id FROM t'"), false);
  });
});

describe('workspaceUsesDrift', () => {
  let fsReadStub: sinon.SinonStub;

  beforeEach(() => {
    fsReadStub = sinon.stub(workspace.fs, 'readFile');
  });

  afterEach(() => {
    fsReadStub.restore();
    (workspace as any).workspaceFolders = undefined;
  });

  it('should return true when pubspec declares drift dependency', async () => {
    (workspace as any).workspaceFolders = [
      { uri: Uri.parse('file:///project'), name: 'project', index: 0 },
    ];
    fsReadStub.resolves(
      new TextEncoder().encode('dependencies:\n  drift: ^2.14.0\n'),
    );

    assert.strictEqual(await workspaceUsesDrift(), true);
  });

  it('should return false when pubspec has no drift dependency', async () => {
    (workspace as any).workspaceFolders = [
      { uri: Uri.parse('file:///project'), name: 'project', index: 0 },
    ];
    fsReadStub.resolves(
      new TextEncoder().encode('dependencies:\n  provider: ^6.0.0\n'),
    );

    assert.strictEqual(await workspaceUsesDrift(), false);
  });

  it('should return false when pubspec.yaml is missing', async () => {
    (workspace as any).workspaceFolders = [
      { uri: Uri.parse('file:///project'), name: 'project', index: 0 },
    ];
    fsReadStub.rejects(new Error('file not found'));

    assert.strictEqual(await workspaceUsesDrift(), false);
  });

  it('should return false when no workspace folders exist', async () => {
    (workspace as any).workspaceFolders = undefined;

    // fs.readFile should never be called — no workspace to read from
    assert.strictEqual(await workspaceUsesDrift(), false);
    assert.strictEqual(fsReadStub.callCount, 0);
  });
});

// Tests for parsing the store_date_time_values_as_text flag from build.yaml
// content. Uses the pure-function parseDateTimeAsText to avoid FS mocking.
describe('parseDateTimeAsText', () => {
  it('should return true when store_date_time_values_as_text is true', () => {
    const yaml = [
      'targets:',
      '  $default:',
      '    builders:',
      '      drift_dev:',
      '        options:',
      '          store_date_time_values_as_text: true',
    ].join('\n');
    assert.strictEqual(parseDateTimeAsText(yaml), true);
  });

  it('should return false when store_date_time_values_as_text is false', () => {
    const yaml = [
      'targets:',
      '  $default:',
      '    builders:',
      '      drift_dev:',
      '        options:',
      '          store_date_time_values_as_text: false',
    ].join('\n');
    assert.strictEqual(parseDateTimeAsText(yaml), false);
  });

  it('should return false when option is absent (Drift default)', () => {
    const yaml = [
      'targets:',
      '  $default:',
      '    builders:',
      '      drift_dev:',
      '        options:',
      '          generate_connect_constructor: true',
    ].join('\n');
    assert.strictEqual(parseDateTimeAsText(yaml), false);
  });

  it('should handle fully-qualified builder key (drift_dev|drift_dev)', () => {
    // Drift also accepts the pipe-qualified builder key form
    const yaml = [
      'targets:',
      '  $default:',
      '    builders:',
      '      drift_dev|drift_dev:',
      '        options:',
      '          store_date_time_values_as_text: true',
    ].join('\n');
    assert.strictEqual(parseDateTimeAsText(yaml), true);
  });

  it('should return false for empty build.yaml content', () => {
    assert.strictEqual(parseDateTimeAsText(''), false);
  });

  it('should ignore a commented-out store_date_time_values_as_text line', () => {
    // A YAML comment `# key: true` must not activate the flag — common when
    // toggling settings. Without this guard the regex matches inside comments
    // and silently suppresses real type-drift diagnostics.
    const yaml = [
      'targets:',
      '  $default:',
      '    builders:',
      '      drift_dev:',
      '        options:',
      '          # store_date_time_values_as_text: true',
    ].join('\n');
    assert.strictEqual(parseDateTimeAsText(yaml), false);
  });
});

// Tests for dartToSqlType — the configuration-aware type resolver that
// replaces the static DART_TO_SQL_TYPE lookup for DateTimeColumn.
describe('dartToSqlType', () => {
  it('should return TEXT for DateTimeColumn when dateTimeAsText is true', () => {
    assert.strictEqual(dartToSqlType('DateTimeColumn', true), 'TEXT');
  });

  it('should return INTEGER for DateTimeColumn when dateTimeAsText is false', () => {
    assert.strictEqual(dartToSqlType('DateTimeColumn', false), 'INTEGER');
  });

  it('should return undefined for DateTimeColumn when dateTimeAsText is undefined', () => {
    // undefined = build.yaml absent — caller should accept either type
    assert.strictEqual(dartToSqlType('DateTimeColumn', undefined), undefined);
  });

  it('should return INTEGER for IntColumn regardless of dateTimeAsText', () => {
    // Non-DateTimeColumn types are not affected by the flag
    assert.strictEqual(dartToSqlType('IntColumn', true), 'INTEGER');
    assert.strictEqual(dartToSqlType('IntColumn', false), 'INTEGER');
    assert.strictEqual(dartToSqlType('IntColumn', undefined), 'INTEGER');
  });

  it('should return TEXT for TextColumn regardless of dateTimeAsText', () => {
    assert.strictEqual(dartToSqlType('TextColumn', true), 'TEXT');
    assert.strictEqual(dartToSqlType('TextColumn', undefined), 'TEXT');
  });

  it('should return undefined for unknown Dart types', () => {
    assert.strictEqual(dartToSqlType('UnknownColumn', false), undefined);
  });
});
