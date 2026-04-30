/**
 * Unit tests for migration plan generation (Feature 66).
 */
import * as assert from 'node:assert';
import { describe, it } from 'mocha';
import { MigrationPlanBuilder, pascalCaseFromSqlTable } from '../refactoring/refactoring-plan-builder';
import type { TableMetadata } from '../api-types';

describe('MigrationPlanBuilder', () => {
  const builder = new MigrationPlanBuilder();

  it('buildNormalizationPlan produces five ordered steps', () => {
    const plan = builder.buildNormalizationPlan('orders', 'status');
    assert.strictEqual(plan.steps.length, 5);
    assert.strictEqual(plan.steps[0]?.title, 'Create lookup table');
    assert.strictEqual(plan.steps[4]?.title, 'Drop legacy text column');
    assert.strictEqual(plan.steps[4]?.destructive, true);
    assert.ok(plan.preflightWarnings.length > 0);
    assert.ok(plan.dartCode.includes('onUpgrade'));
    assert.ok(plan.dartCode.includes("r'''"));
    assert.ok(plan.driftTableClass.includes('extends Table'));
  });

  it('quotes identifiers in normalization SQL', () => {
    const plan = builder.buildNormalizationPlan('my orders', 'status');
    assert.ok(plan.steps.some((s) => s.sql.includes('"my orders"')));
    assert.ok(plan.steps[0]?.sql.includes('CREATE TABLE'));
  });

  it('buildSplitPlan uses single PK and detail table', () => {
    const meta: TableMetadata[] = [
      {
        name: 'users',
        rowCount: 100,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'bio', type: 'TEXT', pk: false },
        ],
      },
    ];
    const plan = builder.buildFor(
      {
        id: 'split:users',
        type: 'split',
        title: 'Split users',
        description: 'wide',
        tables: ['users'],
        columns: ['bio'],
        evidence: [],
        severity: 'medium',
        impact: { integrityImproved: false, queryComplexity: 'more-complex' },
        estimatedMigrationRisk: 'medium',
        confidence: 0.7,
      },
      meta,
    );
    assert.ok(plan.steps[0]?.sql.includes('users_detail'));
    assert.ok(plan.steps[0]?.sql.includes('REFERENCES'));
    assert.ok(plan.steps[1]?.sql.includes('INSERT INTO'));
  });

  it('buildSplitPlan warns on composite PK', () => {
    const meta: TableMetadata[] = [
      {
        name: 'pair',
        rowCount: 1,
        columns: [
          { name: 'a', type: 'INTEGER', pk: true },
          { name: 'b', type: 'INTEGER', pk: true },
        ],
      },
    ];
    const plan = builder.buildFor(
      {
        id: 'split:pair',
        type: 'split',
        title: 'Split pair',
        description: 'wide',
        tables: ['pair'],
        columns: ['a'],
        evidence: [],
        severity: 'low',
        impact: { integrityImproved: false, queryComplexity: 'more-complex' },
        estimatedMigrationRisk: 'low',
        confidence: 0.6,
      },
      meta,
    );
    assert.ok(plan.preflightWarnings.some((w) => w.includes('primary key')));
  });

  it('buildMergePlan references target PK', () => {
    const meta: TableMetadata[] = [
      {
        name: 'audit',
        rowCount: 10,
        columns: [{ name: 'email', type: 'TEXT', pk: false }],
      },
      {
        name: 'users',
        rowCount: 10,
        columns: [
          { name: 'id', type: 'INTEGER', pk: true },
          { name: 'email', type: 'TEXT', pk: false },
        ],
      },
    ];
    const plan = builder.buildFor(
      {
        id: 'm',
        type: 'merge',
        title: 'merge',
        description: 'd',
        tables: ['audit', 'users'],
        columns: ['email'],
        evidence: [],
        severity: 'medium',
        impact: { integrityImproved: true, queryComplexity: 'same' },
        estimatedMigrationRisk: 'medium',
        confidence: 0.6,
      },
      meta,
    );
    assert.ok(plan.steps[0]?.sql.includes('REFERENCES'));
    assert.ok(plan.steps[1]?.sql.includes('UPDATE'));
  });

  it('pascalCaseFromSqlTable handles snake case', () => {
    assert.strictEqual(pascalCaseFromSqlTable('order_statuses'), 'OrderStatuses');
  });
});
