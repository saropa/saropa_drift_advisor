import * as assert from 'assert';
import { rowsToObjects } from '../timeline/snapshot-store';

describe('rowsToObjects', () => {
  it('should convert array rows to keyed objects', () => {
    const result = rowsToObjects(['a', 'b'], [[1, 2], [3, 4]]);
    assert.deepStrictEqual(result, [{ a: 1, b: 2 }, { a: 3, b: 4 }]);
  });
});
