import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// Smoke test verifying the Vitest + fast-check + jsdom toolchain is wired up.
describe('toolchain setup', () => {
  it('runs Vitest assertions', () => {
    expect(1 + 1).toBe(2);
  });

  it('runs fast-check property tests', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
      { numRuns: 100 }
    );
  });

  it('provides a jsdom DOM environment', () => {
    const canvas = document.createElement('canvas');
    expect(canvas.getContext).toBeTypeOf('function');
    expect(typeof window).toBe('object');
  });
});
