import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import { aabbIntersect, ghostHitsPipe, ghostHitsBounds } from '../src/collision.js';
import { CONFIG } from '../src/config.js';

// Feature: flappy-kiro, Property 12: Collision with any pipe, the Ground, or the Ceiling ends the game
// Validates: Requirements 5.1, 5.2, 5.3
//
// A collision is reported if and only if, for the Ghost's bounding box:
//  - it overlaps any Pipe segment (top or bottom), using strict-inequality AABB
//    overlap (R5.1), OR
//  - its bottom edge reaches or passes the top of the Ground (inclusive, R5.2), OR
//  - its top edge reaches or passes the Ceiling at y = 0 (inclusive, R5.3).
//
// Each test independently recomputes the expected boolean from raw geometry and
// asserts the module functions agree.
describe('Property 12: Collision with any pipe, the Ground, or the Ceiling ends the game', () => {
  const { playArea } = CONFIG;
  const groundTop = playArea.height - playArea.groundHeight;

  // Ghost generator: center position spanning (and slightly exceeding) the
  // Play_Area on both axes so runs mix clear-air, grazing, and overlapping
  // cases against bounds and pipes. Size varies around the configured ghost.
  const ghostArb = fc.record({
    x: fc.double({ min: -100, max: playArea.width + 100, noNaN: true }),
    y: fc.double({ min: -50, max: playArea.height + 50, noNaN: true }),
    vy: fc.double({ min: -1000, max: 1000, noNaN: true }),
    width: fc.double({ min: 10, max: 60, noNaN: true }),
    height: fc.double({ min: 10, max: 60, noNaN: true }),
  });

  // Box from a ghost center + size (mirrors collision.js's internal ghostBox).
  const boxOf = (g) => ({
    left: g.x - g.width / 2,
    top: g.y - g.height / 2,
    right: g.x + g.width / 2,
    bottom: g.y + g.height / 2,
  });

  // --- aabbIntersect: strict-inequality overlap on both axes ---
  it('aabbIntersect matches strict-inequality overlap on both axes (touching edges do not overlap)', () => {
    const boxArb = fc.record({
      left: fc.double({ min: -200, max: 200, noNaN: true }),
      top: fc.double({ min: -200, max: 200, noNaN: true }),
      // widths/heights kept positive so left < right and top < bottom.
      w: fc.double({ min: 0, max: 100, noNaN: true }),
      h: fc.double({ min: 0, max: 100, noNaN: true }),
    }).map(({ left, top, w, h }) => ({
      left,
      top,
      right: left + w,
      bottom: top + h,
    }));

    fc.assert(
      fc.property(boxArb, boxArb, (a, b) => {
        const expected =
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top;
        expect(aabbIntersect(a, b)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  // --- ghostHitsPipe: ghost box vs derived top & bottom segment boxes ---
  it('ghostHitsPipe reports iff the ghost box overlaps the top or bottom pipe segment', () => {
    // Pipe gap center placed anywhere across the Play_Area height (including
    // degenerate placements) so the derived segments vary widely. gapHeight
    // and width stay positive.
    const pipeArb = fc.record({
      x: fc.double({ min: -50, max: playArea.width + 50, noNaN: true }),
      gapY: fc.double({ min: 0, max: playArea.height, noNaN: true }),
      gapHeight: fc.double({ min: 20, max: 300, noNaN: true }),
      width: fc.double({ min: 20, max: 100, noNaN: true }),
    });

    fc.assert(
      fc.property(ghostArb, pipeArb, (ghost, pipe) => {
        const box = boxOf(ghost);
        const halfGap = pipe.gapHeight / 2;
        const halfPipe = pipe.width / 2;
        const pipeLeft = pipe.x - halfPipe;
        const pipeRight = pipe.x + halfPipe;

        const topSegment = {
          left: pipeLeft,
          top: 0,
          right: pipeRight,
          bottom: pipe.gapY - halfGap,
        };
        const bottomSegment = {
          left: pipeLeft,
          top: pipe.gapY + halfGap,
          right: pipeRight,
          bottom: groundTop,
        };

        const overlaps = (seg) =>
          box.left < seg.right &&
          box.right > seg.left &&
          box.top < seg.bottom &&
          box.bottom > seg.top;

        const expected = overlaps(topSegment) || overlaps(bottomSegment);
        expect(ghostHitsPipe(ghost, pipe, playArea)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  // --- ghostHitsBounds: ceiling (top <= 0) or ground (bottom >= groundTop) ---
  it('ghostHitsBounds reports iff the ghost reaches/passes the Ceiling or Ground (inclusive)', () => {
    fc.assert(
      fc.property(ghostArb, (ghost) => {
        const box = boxOf(ghost);
        const expected = box.top <= 0 || box.bottom >= groundTop;
        expect(ghostHitsBounds(ghost, playArea)).toBe(expected);
      }),
      { numRuns: 100 }
    );
  });

  // --- End-to-end: a collision is any pipe hit OR a bounds hit ---
  it('overall collision holds iff the ghost hits any pipe segment or a Play_Area boundary', () => {
    const pipeArb = fc.record({
      x: fc.double({ min: -50, max: playArea.width + 50, noNaN: true }),
      gapY: fc.double({ min: 0, max: playArea.height, noNaN: true }),
      gapHeight: fc.double({ min: 20, max: 300, noNaN: true }),
      width: fc.double({ min: 20, max: 100, noNaN: true }),
      scored: fc.boolean(),
    });

    fc.assert(
      fc.property(
        ghostArb,
        fc.array(pipeArb, { maxLength: 8 }),
        (ghost, pipes) => {
          const box = boxOf(ghost);

          const overlaps = (seg) =>
            box.left < seg.right &&
            box.right > seg.left &&
            box.top < seg.bottom &&
            box.bottom > seg.top;

          const expectedPipeHit = pipes.some((pipe) => {
            const halfGap = pipe.gapHeight / 2;
            const halfPipe = pipe.width / 2;
            const pipeLeft = pipe.x - halfPipe;
            const pipeRight = pipe.x + halfPipe;
            const top = {
              left: pipeLeft,
              top: 0,
              right: pipeRight,
              bottom: pipe.gapY - halfGap,
            };
            const bottom = {
              left: pipeLeft,
              top: pipe.gapY + halfGap,
              right: pipeRight,
              bottom: groundTop,
            };
            return overlaps(top) || overlaps(bottom);
          });

          const expectedBoundsHit = box.top <= 0 || box.bottom >= groundTop;
          const expectedCollision = expectedPipeHit || expectedBoundsHit;

          const actualPipeHit = pipes.some((pipe) =>
            ghostHitsPipe(ghost, pipe, playArea)
          );
          const actualCollision = actualPipeHit || ghostHitsBounds(ghost, playArea);

          expect(actualCollision).toBe(expectedCollision);
        }
      ),
      { numRuns: 100 }
    );
  });
});
