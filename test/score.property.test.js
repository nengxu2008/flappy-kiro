import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { scorePasses } from '../src/score.js';

// Feature: flappy-kiro, Property 14: Each pipe scores exactly once per session
// Validates: Requirements 6.2, 6.4, 6.5
describe('Property 14: Each pipe scores exactly once per session', () => {
  it('counts each pipe at most once across a frame sequence, never re-counts, and keeps a non-negative integer score', () => {
    // A single pipe matching the design shape { x, gapY, gapHeight, width, scored }.
    // Pipes always start unscored at the beginning of a session.
    const pipeArb = fc.record({
      x: fc.double({ min: -500, max: 500, noNaN: true }),
      gapY: fc.double({ min: 0, max: 640, noNaN: true }),
      gapHeight: fc.double({ min: 1, max: 500, noNaN: true }),
      width: fc.double({ min: 1, max: 200, noNaN: true }),
      scored: fc.constant(false),
    });

    fc.assert(
      fc.property(
        // A set of pipes present for the whole session, each keyed by index so
        // we can track how many times any individual pipe is counted.
        fc.array(pipeArb, { minLength: 1, maxLength: 15 }),
        // A sequence of frames. Each frame advances the Ghost's horizontal
        // position (the Ghost moves right past pipes, or pipes scroll left —
        // relative to the Ghost these are equivalent). ghostX is drawn across
        // the full pipe range so some frames pass pipes and some do not.
        fc.array(fc.double({ min: -600, max: 600, noNaN: true }), {
          minLength: 1,
          maxLength: 30,
        }),
        (initialPipes, ghostXSequence) => {
          // Track per-pipe cumulative count by stable index. We tag each pipe
          // with an __id so we can follow it as scorePasses returns new objects.
          let pipes = initialPipes.map((pipe, i) => ({ ...pipe, __id: i }));
          const countsById = new Array(initialPipes.length).fill(0);

          let score = 0;

          for (const ghostX of ghostXSequence) {
            const ghost = { x: ghostX, y: 0, vy: 0, width: 34, height: 24 };

            // Snapshot which pipes are unscored before this call so we can
            // attribute the gain to the specific pipes that flipped.
            const before = pipes.map((p) => p.scored);
            const result = scorePasses(ghost, pipes);

            // The gain must equal the number of pipes that flipped from
            // unscored to scored this frame — never more.
            let flipped = 0;
            result.pipes.forEach((p, i) => {
              if (!before[i] && p.scored) {
                flipped += 1;
                countsById[p.__id] += 1;
              }
            });
            expect(result.gained).toBe(flipped);

            // gained is a non-negative integer.
            expect(Number.isInteger(result.gained)).toBe(true);
            expect(result.gained).toBeGreaterThanOrEqual(0);

            score += result.gained;

            // Accumulated score stays a non-negative integer every frame (R6.4).
            expect(Number.isInteger(score)).toBe(true);
            expect(score).toBeGreaterThanOrEqual(0);

            // Immediately re-running scorePasses with the SAME ghost on the
            // returned pipes must never re-count an already-scored pipe (R6.5).
            const rerun = scorePasses(ghost, result.pipes);
            expect(rerun.gained).toBe(0);

            pipes = result.pipes;
          }

          // Across the whole session, every pipe was counted at most once
          // (R6.2, R6.5) — the Score never increases by more than 1 per pipe.
          countsById.forEach((count) => {
            expect(count).toBeLessThanOrEqual(1);
          });

          // The final accumulated score equals the number of pipes counted,
          // which cannot exceed the number of pipes present.
          const totalCounted = countsById.reduce((a, b) => a + b, 0);
          expect(score).toBe(totalCounted);
          expect(score).toBeLessThanOrEqual(initialPipes.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
