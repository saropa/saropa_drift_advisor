/**
 * Tests for drift-source-locator: findDriftTableClassLocation,
 * findDriftColumnGetterLocation, and the exclude-glob behavior.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
  findDriftTableClassLocation,
  findDriftColumnGetterLocation,
} from '../definition/drift-source-locator';
import { encodeUtf8 as encode } from './source-reader-test-helpers';

const vscodeMock = vscode as any;

describe('findDriftTableClassLocation()', () => {
  let findFilesStub: sinon.SinonStub;
  let fsReadFileStub: sinon.SinonStub;

  beforeEach(() => {
    findFilesStub = sinon.stub(vscodeMock.workspace, 'findFiles');
    fsReadFileStub = sinon.stub(vscodeMock.workspace.fs, 'readFile');
  });

  afterEach(() => {
    findFilesStub.restore();
    fsReadFileStub.restore();
  });

  it('should return filesSearched count with a found location', async () => {
    const content = 'class Users extends Table {\n}\n';
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(content));

    const result = await findDriftTableClassLocation('users');
    assert.ok(result.location, 'Expected a location');
    assert.strictEqual(result.filesSearched, 1);
  });

  it('should return filesSearched count when no match', async () => {
    const fileUri = vscodeMock.Uri.file('/lib/other.dart');
    findFilesStub.resolves([fileUri, fileUri, fileUri]);
    fsReadFileStub.resolves(
      encode('class Unrelated extends StatelessWidget {}'),
    );

    const result = await findDriftTableClassLocation('users');
    assert.strictEqual(result.location, null);
    assert.strictEqual(result.filesSearched, 3);
  });

  it('should return 0 filesSearched when workspace has no dart files', async () => {
    findFilesStub.resolves([]);

    const result = await findDriftTableClassLocation('users');
    assert.strictEqual(result.location, null);
    assert.strictEqual(result.filesSearched, 0);
  });

  it('should pass exclude glob that skips .g.dart and .freezed.dart', async () => {
    findFilesStub.resolves([]);
    await findDriftTableClassLocation('any');

    // Verify the exclude glob was passed to findFiles.
    const [, excludeGlob] = findFilesStub.firstCall.args;
    assert.ok(
      excludeGlob.includes('*.g.dart'),
      `Exclude glob should skip .g.dart files, got: ${excludeGlob}`,
    );
    assert.ok(
      excludeGlob.includes('*.freezed.dart'),
      `Exclude glob should skip .freezed.dart files, got: ${excludeGlob}`,
    );
  });

  it('should exclude all dot-prefixed directories', async () => {
    findFilesStub.resolves([]);
    await findDriftTableClassLocation('any');

    // The blanket '**/.*' pattern covers .fvm, .dart_tool, .symlinks, .git, etc.
    const [, excludeGlob] = findFilesStub.firstCall.args;
    assert.ok(
      excludeGlob.includes('**/.*'),
      `Exclude glob should skip dot-prefixed dirs, got: ${excludeGlob}`,
    );
  });

  it('should not call openTextDocument during bulk scanning', async () => {
    // The whole point of this bug fix: bulk scans must use fs.readFile,
    // not openTextDocument which fires workspace events.
    const openDocStub = sinon.stub(vscodeMock.workspace, 'openTextDocument');
    try {
      const content = 'class Users extends Table {\n}\n';
      const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
      findFilesStub.resolves([fileUri]);
      fsReadFileStub.resolves(encode(content));

      await findDriftTableClassLocation('users');
      assert.strictEqual(
        openDocStub.callCount,
        0,
        'openTextDocument must not be called during bulk scanning',
      );
    } finally {
      openDocStub.restore();
    }
  });

  it('should prefer unsaved dirty-buffer text over disk bytes', async () => {
    // The disk has an old version without the table class.
    const diskContent = 'class OldName extends StatelessWidget {}';
    // The open editor tab has unsaved edits with the table class.
    const dirtyContent = 'class Users extends Table {\n}\n';
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(diskContent));

    // Inject a mock open document with unsaved edits.
    const origDocs = vscodeMock.workspace.textDocuments;
    vscodeMock.workspace.textDocuments = [
      { uri: fileUri, getText: () => dirtyContent },
    ];
    try {
      const result = await findDriftTableClassLocation('users');
      assert.ok(result.location, 'Should find table in dirty buffer');
      assert.strictEqual(result.location.range.start.line, 0);
      // fs.readFile should not have been called since the dirty buffer matched.
      assert.strictEqual(fsReadFileStub.callCount, 0);
    } finally {
      vscodeMock.workspace.textDocuments = origDocs;
    }
  });

  it('should compute correct line position without a TextDocument', async () => {
    // Table class on line 3 (0-indexed: line 2).
    const content = 'import "a";\n\nclass Users extends Table {\n}\n';
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(content));

    const result = await findDriftTableClassLocation('users');
    assert.ok(result.location);
    // "class Users" starts at line 2.
    assert.strictEqual(result.location.range.start.line, 2);
  });
});

describe('findDriftColumnGetterLocation()', () => {
  let findFilesStub: sinon.SinonStub;
  let fsReadFileStub: sinon.SinonStub;

  const tableContent = [
    'import \'package:drift/drift.dart\';',
    '',
    'class Users extends Table {',
    '  IntColumn get id => integer().autoIncrement()();',
    '  TextColumn get email => text()();',
    '}',
  ].join('\n');

  beforeEach(() => {
    findFilesStub = sinon.stub(vscodeMock.workspace, 'findFiles');
    fsReadFileStub = sinon.stub(vscodeMock.workspace.fs, 'readFile');
  });

  afterEach(() => {
    findFilesStub.restore();
    fsReadFileStub.restore();
  });

  it('should return exact getter location when found', async () => {
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(tableContent));

    const result = await findDriftColumnGetterLocation('email', 'users');
    assert.ok(result.location, 'Expected exact getter location');
    assert.strictEqual(result.tableClassFallback, null);
    // 'get email' is on line 4.
    assert.strictEqual(result.location.range.start.line, 4);
  });

  it('should return table class fallback when getter not found', async () => {
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(tableContent));

    // 'missing_col' has no getter in the Users class.
    const result = await findDriftColumnGetterLocation('missing_col', 'users');
    assert.strictEqual(result.location, null, 'Should not find getter');
    assert.ok(result.tableClassFallback, 'Should have table class fallback');
    // 'class Users extends Table' is on line 2.
    assert.strictEqual(result.tableClassFallback.range.start.line, 2);
  });

  it('should return null location and null fallback when table class not found', async () => {
    const fileUri = vscodeMock.Uri.file('/lib/other.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode('class Unrelated {}'));

    const result = await findDriftColumnGetterLocation('id', 'users');
    assert.strictEqual(result.location, null);
    assert.strictEqual(result.tableClassFallback, null);
  });

  it('should include filesSearched in all result paths', async () => {
    findFilesStub.resolves([]);

    const result = await findDriftColumnGetterLocation('id', 'users');
    assert.strictEqual(result.filesSearched, 0);
  });

  it('should resolve snake_case column to camelCase getter', async () => {
    const content = [
      'class Users extends Table {',
      '  IntColumn get createdAt => integer()();',
      '}',
    ].join('\n');
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    fsReadFileStub.resolves(encode(content));

    const result = await findDriftColumnGetterLocation('created_at', 'users');
    assert.ok(result.location, 'Should match camelCase getter');
    assert.strictEqual(result.location.range.start.line, 1);
  });

  it('should not call openTextDocument during bulk scanning', async () => {
    const openDocStub = sinon.stub(vscodeMock.workspace, 'openTextDocument');
    try {
      const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
      findFilesStub.resolves([fileUri]);
      fsReadFileStub.resolves(encode(tableContent));

      await findDriftColumnGetterLocation('email', 'users');
      assert.strictEqual(
        openDocStub.callCount,
        0,
        'openTextDocument must not be called during bulk scanning',
      );
    } finally {
      openDocStub.restore();
    }
  });
});
