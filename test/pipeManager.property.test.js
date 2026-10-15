import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { spawnPipe } from '../src/pipeManager.js';
import { CONFIG } from '../src/config.js';

// Feature: flappy-kiro, Property 9: Pipe spawn spacing is constant
// Validates: Requirements 4.2
describe('Property 9: Pipe spawn spacing is constant', () => {
  it('spawns consecutive pipes exactly PIPE_SPACING apart (center-to-center)', () => {
    fc.assert(
      fc.property(
        // An arbitrary starting center-line X for the first pipe.
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        // A sequence of rng draws in [0, 1) used for gap selection. The number
        // of draws (>= 2) determines how many pipes we spawn in the sequence.
        fc.array(fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }), {
          minLength: 2,
          maxLength: 20,
        }),
        (startX, rngValues) => {
          // Build a sequence of spawned pipes, feeding each pipe's x as the
          // lastPipeX for the next spawn. gap selection draws from rngValues.
          const pipes = [];
          let lastPipeX = startX;
          for (const value of rngValues) {
            const rng = () => value;
            const pipe = spawnPipe(rng, CONFIG.playArea, lastPipeX);
            pipes.push(pipe);
            lastPipeX = pipe.x;
          }

          // Each consecutive center-to-center distance equals PIPE_SPACING,
          // independent of the random gap placement (R4.2). Use an approximate
          // comparison so IEEE-754 rounding from summing arbitrary doubles
          // (e.g. 259.99999999999994 vs 260) does not spuriously fail the
          // mathematical equality the spacing guarantees.
          for (let i = 1; i < pipes.length; i++) {
            expect(pipes[i].x - pipes[i - 1].x).toBeCloseTo(
              CONFIG.PIPE_SPACING,
              9
            );
          }
          // The first pipe sits PIPE_SPACING to the right of the start seed.
          expect(pipes[0].x - startX).toBeCloseTo(CONFIG.PIPE_SPACING, 9);
        }
      ),
      { numRuns: 100 }
    );
  });
});

import { advancePipes } from '../src/pipeManager.js';

// Feature: flappy-kiro, Property 8: Pipes scroll left at a fixed speed
// Validates: Requirements 4.1
describe('Property 8: Pipes scroll left at a fixed speed', () => {
  it('moves each pipe x to x - PIPE_SPEED * dt for any pipe set and dt >= 0', () => {
    // Arbitrary pipe matching the design shape { x, gapY, gapHeight, width, scored }.
    const pipeArb = fc.record({
      x: fc.double({ min: -1e4, max: 1e4, noNaN: true }),
      gapY: fc.double({ min: 0, max: CONFIG.playArea.height, noNaN: true }),
      gapHeight: fc.double({ min: 1, max: 500, noNaN: true }),
      width: fc.double({ min: 1, max: 200, noNaN: true }),
      scored: fc.boolean(),
    });

    fc.assert(
      fc.property(
        fc.array(pipeArb, { maxLength: 20 }),
        fc.double({ min: 0, max: 1, noNaN: true }), // dt >= 0 (seconds)
        (pipes, dt) => {
          const advanced = advancePipes(pipes, dt);

          // Same number of pipes, each scrolled left by PIPE_SPEED * dt (R4.1).
          expect(advanced).toHaveLength(pipes.length);
          advanced.forEach((pipe, i) => {
            expect(pipe.x).toBe(pipes[i].x - CONFIG.PIPE_SPEED * dt);
            // Non-x fields are preserved unchanged.
            expect(pipe.gapY).toBe(pipes[i].gapY);
            expect(pipe.gapHeight).toBe(pipes[i].gapHeight);
            expect(pipe.width).toBe(pipes[i].width);
            expect(pipe.scored).toBe(pipes[i].scored);
          });

          // Non-mutating: inputs are untouched.
          if (pipes.length > 0) {
            expect(advanced[0]).not.toBe(pipes[0]);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

import { cullOffscreen } from '../src/pipeManager.js';

// Feature: flappy-kiro, Property 11: Offscreen pipes are culled, visible pipes retained
// Validates: Requirements 4.6
describe('Property 11: Offscreen pipes are culled, visible pipes retained', () => {
  it('drops pipes whose right edge is past the left edge and retains all others unchanged', () => {
    // Arbitrary pipe matching the design shape { x, gapY, gapHeight, width, scored }.
    // The x range deliberately straddles the left edge so each run mixes
    // offscreen pipes (right edge <= 0) with visible ones (right edge > 0).
    const pipeArb = fc.record({
      x: fc.double({ min: -300, max: 500, noNaN: true }),
      gapY: fc.double({ min: 0, max: CONFIG.playArea.height, noNaN: true }),
      gapHeight: fc.double({ min: 1, max: 500, noNaN: true }),
      width: fc.double({ min: 1, max: 200, noNaN: true }),
      scored: fc.boolean(),
    });

    fc.assert(
      fc.property(fc.array(pipeArb, { maxLength: 20 }), (pipes) => {
        const culled = cullOffscreen(pipes, CONFIG.playArea);

        // The kept set is exactly the pipes whose right edge (x + width/2)
        // remains past the left edge, i.e. x + width/2 > 0 (R4.6).
        const expected = pipes.filter((pipe) => pipe.x + pipe.width / 2 > 0);
        expect(culled).toHaveLength(expected.length);

        // Order is preserved and every retained pipe is the same object,
        // unchanged — culling never mutates or clones survivors.
        expected.forEach((pipe, i) => {
          expect(culled[i]).toBe(pipe);
        });

        // No surviving pipe is actually offscreen, and no offscreen pipe survives.
        culled.forEach((pipe) => {
          expect(pipe.x + pipe.width / 2).toBeGreaterThan(0);
        });
        pipes
          .filter((pipe) => pipe.x + pipe.width / 2 <= 0)
          .forEach((pipe) => {
            expect(culled).not.toContain(pipe);
          });
      }),
      { numRuns: 100 }
    );
  });
});

// Feature: flappy-kiro, Property 10: Generated gaps lie within the Play_Area with required margins
// Validates: Requirements 4.4, 4.5
describe('Property 10: Generated gaps lie within the Play_Area with required margins', () => {
  it('places every generated gap within the margins with the fixed gap height', () => {
    const { GAP_MARGIN, GAP_HEIGHT, playArea, ghost } = CONFIG;

    // Ceiling is the top of the Play_Area; the Ground occupies the bottom strip.
    const ceiling = 0;
    const groundTop = playArea.height - playArea.groundHeight;

    // The fixed Gap height must be at least twice the ghost height (R4.5). This
    // is a configuration invariant, independent of any random draw.
    expect(GAP_HEIGHT).toBeGreaterThanOrEqual(2 * ghost.height);

    fc.assert(
      fc.property(
        // rng draw in [0, 1) driving the uniform gap-center selection.
        fc.double({ min: 0, max: 1, noNaN: true, maxExcluded: true }),
        // An arbitrary last-pipe center-line X (gap placement is independent of x).
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        (rngValue, lastPipeX) => {
          const rng = () => rngValue;
          const pipe = spawnPipe(rng, playArea, lastPipeX);

          const gapTop = pipe.gapY - pipe.gapHeight / 2;
          const gapBottom = pipe.gapY + pipe.gapHeight / 2;

          // Gap top edge sits at least GAP_MARGIN below the Ceiling (R4.4).
          expect(gapTop).toBeGreaterThanOrEqual(ceiling + GAP_MARGIN);
          // Gap bottom edge sits at least GAP_MARGIN above the Ground top (R4.4).
          expect(gapBottom).toBeLessThanOrEqual(groundTop - GAP_MARGIN);
          // Gap height equals the fixed configured value (R4.5).
          expect(pipe.gapHeight).toBe(GAP_HEIGHT);
        }
      ),
      { numRuns: 100 }
    );
  });
});
