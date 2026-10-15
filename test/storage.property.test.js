import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { parseHighScore } from '../src/storage.js';

// Feature: flappy-kiro, Property 1: High score parsing yields a valid non-negative integer
// Validates: Requirements 1.5, 1.6, 1.7
describe('Property 1: High score parsing yields a valid non-negative integer', () => {
  it('always returns a non-negative integer for arbitrary raw values', () => {
    // A mix of raw values spanning every category the parser must reject or
    // accept: null, arbitrary strings, float strings, negative number strings,
    // oversized number strings (beyond the safe-integer range), and valid
    // non-negative integer strings produced from fc.nat().
    const rawArb = fc.oneof(
      // null — the "no stored value" case (R1.6).
      fc.constant(null),
      // Arbitrary strings — mostly non-numeric garbage (R1.7).
      fc.string(),
      // Float strings — non-integer numeric values must be rejected (R1.7).
      fc
        .double({ noNaN: true })
        .filter((n) => !Number.isInteger(n))
        .map((n) => String(n)),
      // Negative number strings — must be rejected (R1.7).
      fc.integer({ min: -1_000_000, max: -1 }).map((n) => String(n)),
      // Oversized number strings beyond Number.MAX_SAFE_INTEGER (R1.7).
      fc
        .bigInt({
          min: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
          max: BigInt(Number.MAX_SAFE_INTEGER) * 1000n,
        })
        .map((n) => n.toString()),
      // Valid non-negative integers rendered as strings (R1.5).
      fc.nat().map((n) => String(n))
    );

    fc.assert(
      fc.property(rawArb, (raw) => {
        const result = parseHighScore(raw);
        // The result is always a non-negative integer regardless of input.
        expect(Number.isInteger(result)).toBe(true);
        expect(result).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 100 }
    );
  });

  it('round-trips any non-negative integer n through parseHighScore(String(n))', () => {
    fc.assert(
      fc.property(fc.nat(), (n) => {
        // For any non-negative integer n, parsing its string form yields n (R1.5).
        expect(parseHighScore(String(n))).toBe(n);
      }),
      { numRuns: 100 }
    );
  });
});
