/**
 * Tests for the low-overhead dart-source-reader helpers.
 */
import * as assert from 'assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import {
  DART_SOURCE_EXCLUDE_GLOB,
  positionFromOffset,
  readSourceText,
} from '../dart-source-reader';
import { encodeUtf8 as encode } from './source-reader-test-helpers';

const vscodeMock = vscode as any;

describe('DART_SOURCE_EXCLUDE_GLOB', () => {
  it('should exclude build directory', () => {
    assert.ok(DART_SOURCE_EXCLUDE_GLOB.includes('build'));
  });

  it('should exclude all dot-prefixed directories (.fvm, .dart_tool, .git, etc.)', () => {
    // The blanket '**/.*' pattern covers .fvm, .dart_tool, .symlinks, .git,
    // .idea, etc. — previously only specific dot-dirs were listed.
    assert.ok(DART_SOURCE_EXCLUDE_GLOB.includes('**/.*'));
  });

  it('should exclude .g.dart generated files', () => {
    assert.ok(DART_SOURCE_EXCLUDE_GLOB.includes('*.g.dart'));
  });

  it('should exclude .freezed.dart generated files', () => {
    assert.ok(DART_SOURCE_EXCLUDE_GLOB.includes('*.freezed.dart'));
  });

  it('should exclude .mocks.dart generated files', () => {
    assert.ok(DART_SOURCE_EXCLUDE_GLOB.includes('*.mocks.dart'));
  });
});

describe('positionFromOffset()', () => {
  it('should return line 0 character 0 for offset 0', () => {
    const pos = positionFromOffset('hello\nworld', 0);
    assert.strictEqual(pos.line, 0);
    assert.strictEqual(pos.character, 0);
  });

  it('should compute position on the first line', () => {
    const pos = positionFromOffset('hello\nworld', 3);
    assert.strictEqual(pos.line, 0);
    assert.strictEqual(pos.character, 3);
  });

  it('should compute position on a subsequent line', () => {
    const text = 'line one\nline two\nline three';
    // "line three" starts at offset 18.
    const pos = positionFromOffset(text, 18);
    assert.strictEqual(pos.line, 2);
    assert.strictEqual(pos.character, 0);
  });

  it('should handle offset mid-line after newlines', () => {
    const text = 'ab\ncd\nef';
    // 'e' is at offset 6, line 2, character 0.
    const pos = positionFromOffset(text, 6);
    assert.strictEqual(pos.line, 2);
    assert.strictEqual(pos.character, 0);
    // 'f' is at offset 7, line 2, character 1.
    const pos2 = positionFromOffset(text, 7);
    assert.strictEqual(pos2.line, 2);
    assert.strictEqual(pos2.character, 1);
  });

  it('should handle CRLF line endings correctly', () => {
    // Windows-style line endings: \r\n
    const text = 'ab\r\ncd\r\nef';
    // 'c' is at offset 4 (a=0, b=1, \r=2, \n=3, c=4), line 1, char 0.
    const pos = positionFromOffset(text, 4);
    assert.strictEqual(pos.line, 1);
    assert.strictEqual(pos.character, 0);
    // 'd' is at offset 5, line 1, char 1.
    const pos2 = positionFromOffset(text, 5);
    assert.strictEqual(pos2.line, 1);
    assert.strictEqual(pos2.character, 1);
    // 'e' is at offset 8 (\r=6, \n=7, e=8), line 2, char 0.
    const pos3 = positionFromOffset(text, 8);
    assert.strictEqual(pos3.line, 2);
    assert.strictEqual(pos3.character, 0);
  });
});

describe('readSourceText()', () => {
  let fsReadFileStub: sinon.SinonStub;

  beforeEach(() => {
    fsReadFileStub = sinon.stub(vscodeMock.workspace.fs, 'readFile');
  });

  afterEach(() => {
    fsReadFileStub.restore();
  });

  it('should read file bytes and decode as UTF-8', async () => {
    const content = 'class Users extends Table {}';
    const uri = vscodeMock.Uri.file('/lib/tables.dart');
    fsReadFileStub.resolves(encode(content));

    const result = await readSourceText(uri);
    assert.strictEqual(result, content);
  });

  it('should prefer an already-open dirty document over disk bytes', async () => {
    const diskContent = 'old disk content';
    const dirtyContent = 'modified unsaved content';
    const uri = vscodeMock.Uri.file('/lib/tables.dart');
    fsReadFileStub.resolves(encode(diskContent));

    // Temporarily inject a mock open document.
    const origDocs = vscodeMock.workspace.textDocuments;
    vscodeMock.workspace.textDocuments = [
      { uri, getText: () => dirtyContent },
    ];
    try {
      const result = await readSourceText(uri);
      assert.strictEqual(result, dirtyContent);
      // fs.readFile should not have been called.
      assert.strictEqual(fsReadFileStub.callCount, 0);
    } finally {
      vscodeMock.workspace.textDocuments = origDocs;
    }
  });
});
