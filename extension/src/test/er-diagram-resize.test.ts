/**
 * Tests for the ER diagram script output.
 * Validates that the responsive resize listener is present and debounced.
 */

import * as assert from 'assert';
import { getErDiagramScript } from '../er-diagram/er-diagram-script';

describe('getErDiagramScript', () => {
  // Minimal valid JSON to avoid parse errors in the template
  const nodesJson = '[]';
  const edgesJson = '[]';
  const script = getErDiagramScript(nodesJson, edgesJson);

  it('should include a window resize event listener', () => {
    assert.ok(
      script.includes("window.addEventListener('resize'"),
      'Expected window resize event listener',
    );
  });

  it('should debounce the resize handler to avoid excessive redraws', () => {
    assert.ok(
      script.includes('resizeTimer'),
      'Expected resizeTimer debounce variable',
    );
    assert.ok(
      script.includes('clearTimeout(resizeTimer)'),
      'Expected clearTimeout call for debounce',
    );
    assert.ok(
      script.includes('setTimeout(fitToView'),
      'Expected setTimeout call to fitToView in resize handler',
    );
  });

  it('should still include the initial fitToView call', () => {
    assert.ok(
      script.includes('setTimeout(fitToView, 100)'),
      'Expected initial fitToView with 100ms delay',
    );
  });

  it('should include all existing toolbar handlers', () => {
    assert.ok(script.includes("getElementById('fitBtn')"));
    assert.ok(script.includes("getElementById('zoomInBtn')"));
    assert.ok(script.includes("getElementById('zoomOutBtn')"));
    assert.ok(script.includes("getElementById('refreshBtn')"));
    assert.ok(script.includes("getElementById('layoutMode')"));
  });

  it('should include SVG rendering helpers from the extracted module', () => {
    // renderTableNode/getColumnY take the displayed-column list as a parameter so
    // the field filter can hide non-matching columns and still attach edges.
    assert.ok(
      script.includes('function renderTableNode(node, cols)'),
      'Expected renderTableNode function in composed output',
    );
    assert.ok(
      script.includes('function getColumnY(node, cols, columnName)'),
      'Expected getColumnY function in composed output',
    );
    assert.ok(
      script.includes('function bezierPath(x1, y1, x2, y2)'),
      'Expected bezierPath function in composed output',
    );
  });

  it('should use extracted helpers from the main renderDiagram function', () => {
    // Verify renderDiagram calls the extracted helpers
    assert.ok(
      script.includes('getColumnY(fromNode,'),
      'Expected renderDiagram to call getColumnY',
    );
    assert.ok(
      script.includes('bezierPath('),
      'Expected renderDiagram to call bezierPath',
    );
    assert.ok(
      script.includes('renderTableNode(node, visibleColumns(node))'),
      'Expected renderDiagram to call renderTableNode',
    );
  });

  it('should wire the field-filter controls and matching helpers', () => {
    // The search box, type dropdown, and the two match-mode toggles each update
    // filter state and re-render in place (no extension round-trip).
    assert.ok(script.includes("getElementById('fieldSearch')"), 'Expected fieldSearch handler');
    assert.ok(script.includes("getElementById('typeFilter')"), 'Expected typeFilter handler');
    assert.ok(script.includes("getElementById('highlightToggle')"), 'Expected highlight toggle handler');
    assert.ok(script.includes("getElementById('hideToggle')"), 'Expected hide toggle handler');
    // Matching helpers that decide which columns/tables match the filter.
    assert.ok(script.includes('function columnMatches('), 'Expected columnMatches helper');
    assert.ok(script.includes('function visibleColumns('), 'Expected visibleColumns helper');
    assert.ok(script.includes('function nodeMatches('), 'Expected nodeMatches helper');
  });
});
