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
});
