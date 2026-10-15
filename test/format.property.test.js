import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { formatScore } from '../src/format.js';

// Feature: flappy-kiro, Property 22: Score display formatting
// Validates: Requirements 9.10
describe('Property 22: Score display formatting', () => {
  it('formats any non-negative integer (current, high) pair as "Score: {current} | High: {high}"', () => {
    fc.assert(
      fc.property(fc.nat(), fc.nat(), (current, high) => {
        expect(formatScore(current, high)).toBe(
          'Score: ' + current + ' | High: ' + high
        );
      }),
      { numRuns: 100 }
    );
  });
});
