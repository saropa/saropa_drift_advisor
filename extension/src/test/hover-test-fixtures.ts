/**
 * Shared test fixtures for drift-hover-provider tests.
 */

import * as vscode from 'vscode';
import type { TableMetadata } from '../api-client';

const vscodeMock = vscode as any;

export function fakePosition(line = 0, character = 0): any {
  return { line, character };
}

export function fakeDocument(word: string): any {
  return {
    languageId: 'dart',
    getWordRangeAtPosition: (pos: any) => {
      if (!word) return undefined;
      return new vscodeMock.Range(
        pos.line, 0,
        pos.line, word.length,
      );
    },
    getText: (range?: any) => {
      if (range) return word;
      return `class ${word} extends Table {}`;
    },
  };
}

export const SAMPLE_METADATA: TableMetadata[] = [
  {
    name: 'users',
    columns: [
      { name: 'id', type: 'INTEGER', pk: true },
      { name: 'name', type: 'TEXT', pk: false },
      { name: 'email', type: 'TEXT', pk: false },
    ],
    rowCount: 42,
  },
];

export const SAMPLE_SQL_RESULT = {
  columns: ['id', 'name', 'email'],
  rows: [
    [42, 'Alice', 'alice@example.com'],
    [41, 'Bob', 'bob@example.com'],
    [40, 'Carol', null],
  ],
};
