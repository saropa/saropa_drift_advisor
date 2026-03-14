/**
 * Tests for toGrade and HealthScorer.WEIGHTS.
 */

import * as assert from 'assert';
import { HealthScorer, toGrade } from '../health/health-scorer';

describe('toGrade', () => {
  it('should return A+ for 97+', () => {
    assert.strictEqual(toGrade(97), 'A+');
    assert.strictEqual(toGrade(100), 'A+');
  });

  it('should return A for 93–96', () => {
    assert.strictEqual(toGrade(93), 'A');
    assert.strictEqual(toGrade(96), 'A');
  });

  it('should return A- for 90–92', () => {
    assert.strictEqual(toGrade(90), 'A-');
    assert.strictEqual(toGrade(92), 'A-');
  });

  it('should return B+ for 87–89', () => {
    assert.strictEqual(toGrade(87), 'B+');
  });

  it('should return B for 83–86', () => {
    assert.strictEqual(toGrade(83), 'B');
  });

  it('should return B- for 80–82', () => {
    assert.strictEqual(toGrade(80), 'B-');
  });

  it('should return C+ for 77–79', () => {
    assert.strictEqual(toGrade(77), 'C+');
  });

  it('should return C for 73–76', () => {
    assert.strictEqual(toGrade(73), 'C');
  });

  it('should return C- for 70–72', () => {
    assert.strictEqual(toGrade(70), 'C-');
  });

  it('should return D+ for 67–69', () => {
    assert.strictEqual(toGrade(67), 'D+');
  });

  it('should return D for 63–66', () => {
    assert.strictEqual(toGrade(63), 'D');
  });

  it('should return D- for 60–62', () => {
    assert.strictEqual(toGrade(60), 'D-');
  });

  it('should return F for below 60', () => {
    assert.strictEqual(toGrade(59), 'F');
    assert.strictEqual(toGrade(0), 'F');
  });
});

describe('HealthScorer.WEIGHTS', () => {
  it('should sum to 1.0', () => {
    const sum = Object.values(HealthScorer.WEIGHTS).reduce((a, b) => a + b, 0);
    assert.strictEqual(sum, 1.0);
  });
});
