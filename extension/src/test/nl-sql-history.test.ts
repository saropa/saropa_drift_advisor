import * as assert from 'node:assert';
import { MockMemento } from './vscode-mock';
import { NlSqlHistory } from '../nl-sql/nl-sql-history';

describe('NlSqlHistory', () => {
  it('adds entries in newest-first order', () => {
    const history = new NlSqlHistory(new MockMemento());
    history.add('first', 'SELECT 1');
    history.add('second', 'SELECT 2');
    assert.strictEqual(history.entries.length, 2);
    assert.strictEqual(history.entries[0].question, 'second');
  });

  it('deduplicates exact question and sql pairs', () => {
    const history = new NlSqlHistory(new MockMemento());
    history.add('same', 'SELECT 1');
    history.add('same', 'SELECT 1');
    assert.strictEqual(history.entries.length, 1);
  });
});
