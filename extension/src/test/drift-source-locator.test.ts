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

const vscodeMock = vscode as any;

function makeDartFileDocument(content: string): any {
  return {
    getText: () => content,
    positionAt: (offset: number) => {
      const before = content.substring(0, offset);
      const lines = before.split('\n');
      return new vscodeMock.Position(
        lines.length - 1,
        lines[lines.length - 1].length,
      );
    },
    languageId: 'dart',
  };
}

describe('findDriftTableClassLocation()', () => {
  let findFilesStub: sinon.SinonStub;
  let openTextDocumentStub: sinon.SinonStub;

  beforeEach(() => {
    findFilesStub = sinon.stub(vscodeMock.workspace, 'findFiles');
    openTextDocumentStub = sinon.stub(vscodeMock.workspace, 'openTextDocument');
  });

  afterEach(() => {
    findFilesStub.restore();
    openTextDocumentStub.restore();
  });

  it('should return filesSearched count with a found location', async () => {
    const content = 'class Users extends Table {\n}\n';
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    openTextDocumentStub.resolves(makeDartFileDocument(content));

    const result = await findDriftTableClassLocation('users');
    assert.ok(result.location, 'Expected a location');
    assert.strictEqual(result.filesSearched, 1);
  });

  it('should return filesSearched count when no match', async () => {
    const fileUri = vscodeMock.Uri.file('/lib/other.dart');
    findFilesStub.resolves([fileUri, fileUri, fileUri]);
    openTextDocumentStub.resolves(
      makeDartFileDocument('class Unrelated extends StatelessWidget {}'),
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
});

describe('findDriftColumnGetterLocation()', () => {
  let findFilesStub: sinon.SinonStub;
  let openTextDocumentStub: sinon.SinonStub;

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
    openTextDocumentStub = sinon.stub(vscodeMock.workspace, 'openTextDocument');
  });

  afterEach(() => {
    findFilesStub.restore();
    openTextDocumentStub.restore();
  });

  it('should return exact getter location when found', async () => {
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    openTextDocumentStub.resolves(makeDartFileDocument(tableContent));

    const result = await findDriftColumnGetterLocation('email', 'users');
    assert.ok(result.location, 'Expected exact getter location');
    assert.strictEqual(result.tableClassFallback, null);
    // 'get email' is on line 4
    assert.strictEqual(result.location.range.start.line, 4);
  });

  it('should return table class fallback when getter not found', async () => {
    const fileUri = vscodeMock.Uri.file('/lib/tables.dart');
    findFilesStub.resolves([fileUri]);
    openTextDocumentStub.resolves(makeDartFileDocument(tableContent));

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
    openTextDocumentStub.resolves(
      makeDartFileDocument('class Unrelated {}'),
    );

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
    openTextDocumentStub.resolves(makeDartFileDocument(content));

    const result = await findDriftColumnGetterLocation('created_at', 'users');
    assert.ok(result.location, 'Should match camelCase getter');
    assert.strictEqual(result.location.range.start.line, 1);
  });
});
