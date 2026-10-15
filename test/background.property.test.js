import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { createClouds } from '../src/background.js';
import { CONFIG } from '../src/config.js';

// A small seeded PRNG (mulberry32) so each run drives createClouds's rng
// deterministically from a generated 32-bit seed.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Feature: flappy-kiro, Property 21: Cloud speeds are distinct and slower than pipes
// Validates: Requirements 9.5, 9.6
describe('Property 21: Cloud speeds are distinct and slower than pipes', () => {
  it('assigns at least two distinct speeds, each strictly less than PIPE_SPEED, for any cloud set', () => {
    fc.assert(
      fc.property(
        // Varying cloud counts (>= 2) so the cycled speed assignment always has
        // room to hold the >= 2 distinct CLOUD_SPEEDS values (R9.5).
        fc.integer({ min: 2, max: 50 }),
        // A 32-bit seed driving the deterministic rng for cloud layout.
        fc.integer({ min: 0, max: 0xffffffff }),
        (count, seed) => {
          const rng = mulberry32(seed);
          const clouds = createClouds(CONFIG.playArea, count, rng);

          const speeds = clouds.map((c) => c.speed);

          // At least two Clouds move at different speeds (parallax, R9.5).
          expect(new Set(speeds).size).toBeGreaterThanOrEqual(2);

          // Every Cloud speed is strictly less than the Pipe scroll speed (R9.6).
          for (const speed of speeds) {
            expect(speed).toBeLessThan(CONFIG.PIPE_SPEED);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// A local import of advanceClouds for the Property 20 test (the top of this
// file imports only createClouds).
import { advanceClouds } from '../src/background.js';

// Feature: flappy-kiro, Property 20: Clouds advance and wrap in every state
// Validates: Requirements 9.4, 9.7
describe('Property 20: Clouds advance and wrap in every state', () => {
  it('moves each cloud left by speed × dt, wrapping past-left clouds to the right edge', () => {
    fc.assert(
      fc.property(
        // A set of clouds with arbitrary (but finite, bounded) fields. x may be
        // off either edge so both the normal-advance and wrap branches are hit.
        fc.array(
          fc.record({
            x: fc.double({ min: -500, max: 1000, noNaN: true }),
            y: fc.double({ min: 0, max: 640, noNaN: true }),
            width: fc.double({ min: 1, max: 200, noNaN: true }),
            height: fc.double({ min: 1, max: 100, noNaN: true }),
            // Cloud speeds are slower than pipes; keep positive and bounded.
            speed: fc.double({ min: 1, max: 150, noNaN: true }),
            opacity: fc.double({ min: 0.3, max: 0.7, noNaN: true }),
          }),
          { minLength: 0, maxLength: 20 }
        ),
        // dt strictly greater than 0 (clouds advance in every state, R9.4).
        fc.double({ min: Math.fround(0.0001), max: 0.05, noNaN: true }),
        (clouds, dt) => {
          const playArea = CONFIG.playArea;
          const advanced = advanceClouds(clouds, dt, playArea);

          // Same number of clouds returned, and the input is not mutated.
          expect(advanced).toHaveLength(clouds.length);

          for (let i = 0; i < clouds.length; i++) {
            const before = clouds[i];
            const after = advanced[i];
            const movedX = before.x - before.speed * dt;

            if (movedX + before.width < 0) {
              // Past the left edge: repositioned at/beyond the right edge (R9.7).
              expect(after.x).toBe(playArea.width);
            } else {
              // Otherwise it simply advanced left by speed × dt (R9.4).
              expect(after.x).toBe(movedX);
            }

            // Non-x fields carry through unchanged (non-mutating advance).
            expect(after.y).toBe(before.y);
            expect(after.width).toBe(before.width);
            expect(after.height).toBe(before.height);
            expect(after.speed).toBe(before.speed);
            expect(after.opacity).toBe(before.opacity);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// Feature: flappy-kiro, Property 19: Cloud opacity stays within the configured range
// Validates: Requirements 9.3
describe('Property 19: Cloud opacity stays within the configured range', () => {
  it('assigns every cloud an opacity within [CLOUD_OPACITY_MIN, CLOUD_OPACITY_MAX] for any cloud set', () => {
    fc.assert(
      fc.property(
        // Varying cloud counts, including below the factory's floor of 2, so the
        // generated set exercises a range of layout sizes (R9.3).
        fc.integer({ min: 0, max: 50 }),
        // A 32-bit seed driving the deterministic rng for cloud layout.
        fc.integer({ min: 0, max: 0xffffffff }),
        (count, seed) => {
          const rng = mulberry32(seed);
          const clouds = createClouds(CONFIG.playArea, count, rng);

          // Every Cloud's opacity lies within the configured range so the
          // background shows through (R9.3).
          for (const cloud of clouds) {
            expect(cloud.opacity).toBeGreaterThanOrEqual(CONFIG.CLOUD_OPACITY_MIN);
            expect(cloud.opacity).toBeLessThanOrEqual(CONFIG.CLOUD_OPACITY_MAX);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
