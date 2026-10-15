import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { applyGravity, applyFlap } from '../src/physics.js';
import { CONFIG } from '../src/config.js';

const { GRAVITY, MAX_FALL } = CONFIG;

// A generator for arbitrary ghost objects. Only vy matters for gravity, but we
// vary the other fields to confirm applyGravity leaves them untouched.
const ghostArb = fc.record({
  x: fc.double({ min: -1000, max: 1000, noNaN: true }),
  y: fc.double({ min: -1000, max: 1000, noNaN: true }),
  vy: fc.double({ min: -2000, max: 2000, noNaN: true }),
  width: fc.double({ min: 1, max: 100, noNaN: true }),
  height: fc.double({ min: 1, max: 100, noNaN: true }),
});

// Delta time for a single frame: non-negative, bounded by the config clamp.
const dtArb = fc.double({ min: 0, max: CONFIG.MAX_DELTA_SECONDS, noNaN: true });

// Feature: flappy-kiro, Property 5: Gravity integrates velocity and clamps to maximum fall speed
describe('Property 5: Gravity integrates velocity and clamps to maximum fall speed', () => {
  it('increases downward velocity by GRAVITY*dt when below the clamp, and never exceeds MAX_FALL', () => {
    fc.assert(
      fc.property(ghostArb, dtArb, (ghost, dt) => {
        const next = applyGravity(ghost, dt);
        const expectedUnclamped = ghost.vy + GRAVITY * dt;

        // Result never exceeds the maximum downward velocity.
        expect(next.vy).toBeLessThanOrEqual(MAX_FALL);

        if (expectedUnclamped <= MAX_FALL) {
          // Below the clamp: vy increases by exactly GRAVITY*dt.
          expect(next.vy).toBeCloseTo(expectedUnclamped, 6);
        } else {
          // At/above the clamp: vy is pinned to MAX_FALL.
          expect(next.vy).toBeCloseTo(MAX_FALL, 6);
        }

        // Position and other fields are untouched by gravity.
        expect(next.x).toBe(ghost.x);
        expect(next.y).toBe(ghost.y);
        expect(next.width).toBe(ghost.width);
        expect(next.height).toBe(ghost.height);
      }),
      { numRuns: 100 }
    );
  });

  it('keeps vy <= MAX_FALL across any sequence of frames', () => {
    fc.assert(
      fc.property(
        ghostArb,
        fc.array(dtArb, { minLength: 1, maxLength: 60 }),
        (initial, dts) => {
          let ghost = initial;
          for (const dt of dts) {
            const prevVy = ghost.vy;
            ghost = applyGravity(ghost, dt);

            // Invariant: velocity never exceeds the maximum fall speed.
            expect(ghost.vy).toBeLessThanOrEqual(MAX_FALL);

            // Each step either adds GRAVITY*dt (below clamp) or clamps to MAX_FALL.
            const expectedUnclamped = prevVy + GRAVITY * dt;
            const expected = Math.min(expectedUnclamped, MAX_FALL);
            expect(ghost.vy).toBeCloseTo(expected, 6);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: flappy-kiro, Property 2: Flap sets a fixed upward impulse regardless of prior velocity
// Validates: Requirements 2.3, 3.4
describe('Property 2: Flap sets a fixed upward impulse regardless of prior velocity', () => {
  it('sets vy to FLAP_IMPULSE for any prior vertical velocity', () => {
    fc.assert(
      fc.property(
        // Arbitrary ghost with any prior vertical velocity (including large
        // accumulated downward velocity) and arbitrary position/size.
        fc.record({
          x: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
          y: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
          vy: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
          width: fc.double({ min: 1, max: 500, noNaN: true }),
          height: fc.double({ min: 1, max: 500, noNaN: true }),
        }),
        (ghost) => {
          const flapped = applyFlap(ghost);
          // The flap replaces velocity with the fixed upward impulse,
          // discarding any accumulated downward velocity (R2.3, R3.4).
          expect(flapped.vy).toBe(CONFIG.FLAP_IMPULSE);
        }
      ),
      { numRuns: 100 }
    );
  });
});

import { integrate } from '../src/physics.js';

// Non-negative delta time with no NaN/Infinity edge cases.
const integrateDtArb = fc.double({ min: 0, max: 1000, noNaN: true, noDefaultInfinity: true });

// Arbitrary ghost with finite numeric fields for position integration.
const integrateGhostArb = fc.record({
  x: fc.double({ min: -10000, max: 10000, noNaN: true, noDefaultInfinity: true }),
  y: fc.double({ min: -10000, max: 10000, noNaN: true, noDefaultInfinity: true }),
  vy: fc.double({ min: -2000, max: 2000, noNaN: true, noDefaultInfinity: true }),
  width: fc.double({ min: 1, max: 100, noNaN: true }),
  height: fc.double({ min: 1, max: 100, noNaN: true }),
});

// Feature: flappy-kiro, Property 6: Position integrates from velocity
describe('Property 6: Position integrates from velocity', () => {
  it('integrates y from velocity: integrate(ghost, dt).y === ghost.y + ghost.vy * dt', () => {
    fc.assert(
      fc.property(integrateGhostArb, integrateDtArb, (ghost, dt) => {
        const next = integrate(ghost, dt);

        // Position advances by exactly vy * dt (R3.2).
        expect(next.y).toBe(ghost.y + ghost.vy * dt);

        // All other fields are carried through unchanged (non-mutating).
        expect(next.x).toBe(ghost.x);
        expect(next.vy).toBe(ghost.vy);
        expect(next.width).toBe(ghost.width);
        expect(next.height).toBe(ghost.height);
      }),
      { numRuns: 100 }
    );
  });
});
