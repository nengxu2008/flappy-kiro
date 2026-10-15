/**
 * collision.js — Flappy Kiro pure collision module.
 *
 * Axis-aligned bounding-box (AABB) collision math for the Ghost against Pipes,
 * the Ground, and the Ceiling. Every function here is pure: it reads its inputs,
 * returns a boolean, and mutates nothing.
 *
 * Coordinate convention (shared across the game): origin top-left, Y increases
 * downward, upward velocity is negative. A box is `{ left, top, right, bottom }`
 * where `top < bottom` (smaller Y is higher on screen).
 *
 * Shapes:
 * - Ghost:    `{ x, y, vy, width, height }` — `x`/`y` are the center; the
 *             bounding box is `{ left: x - width/2, top: y - height/2,
 *             right: x + width/2, bottom: y + height/2 }`.
 * - Pipe:     `{ x, gapY, gapHeight, width, scored }` — `x` is the center-line;
 *             the top segment runs from the Ceiling (y = 0) to `gapY -
 *             gapHeight/2`, and the bottom segment runs from `gapY + gapHeight/2`
 *             to the top of the Ground.
 * - playArea: `{ width, height, groundHeight }` — Ground top is `height -
 *             groundHeight`; the Ceiling is y = 0.
 *
 * _Requirements: 5.1, 5.2, 5.3_
 */

/**
 * Compute the AABB of a Ghost from its center position and size.
 *
 * @param {{ x: number, y: number, width: number, height: number }} ghost
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
function ghostBox(ghost) {
  const halfW = ghost.width / 2;
  const halfH = ghost.height / 2;
  return {
    left: ghost.x - halfW,
    top: ghost.y - halfH,
    right: ghost.x + halfW,
    bottom: ghost.y + halfH,
  };
}

/**
 * Standard AABB overlap test. Two boxes intersect when they overlap on both the
 * horizontal and vertical axes. Boxes that merely touch along an edge (equal
 * coordinates) do not count as intersecting.
 *
 * @param {{ left: number, top: number, right: number, bottom: number }} a
 * @param {{ left: number, top: number, right: number, bottom: number }} b
 * @returns {boolean} true when the two boxes overlap.
 */
export function aabbIntersect(a, b) {
  return (
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top
  );
}

/**
 * Test whether the Ghost's bounding box intersects either segment of a Pipe.
 *
 * The Pipe's two solid segments are derived from its gap:
 * - Top segment:    Ceiling (y = 0) down to `gapY - gapHeight/2`.
 * - Bottom segment: `gapY + gapHeight/2` down to the top of the Ground
 *                   (`playArea.height - playArea.groundHeight`).
 *
 * Both segments share the pipe's horizontal span, centered on `pipe.x` with
 * width `pipe.width`.
 *
 * @param {{ x: number, y: number, width: number, height: number }} ghost
 * @param {{ x: number, gapY: number, gapHeight: number, width: number }} pipe
 * @param {{ width: number, height: number, groundHeight: number }} playArea
 * @returns {boolean} true when the Ghost overlaps the top or bottom segment.
 */
export function ghostHitsPipe(ghost, pipe, playArea) {
  const box = ghostBox(ghost);
  const halfGap = pipe.gapHeight / 2;
  const halfPipe = pipe.width / 2;
  const pipeLeft = pipe.x - halfPipe;
  const pipeRight = pipe.x + halfPipe;
  const groundTop = playArea.height - playArea.groundHeight;

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

  return aabbIntersect(box, topSegment) || aabbIntersect(box, bottomSegment);
}

/**
 * Test whether the Ghost has reached or passed either vertical boundary of the
 * Play_Area: the Ceiling (y = 0) or the top of the Ground
 * (`playArea.height - playArea.groundHeight`).
 *
 * The boundary is inclusive — touching the edge counts as a hit (R5.2, R5.3).
 *
 * @param {{ x: number, y: number, width: number, height: number }} ghost
 * @param {{ width: number, height: number, groundHeight: number }} playArea
 * @returns {boolean} true when the Ghost touches or crosses the Ceiling or Ground.
 */
export function ghostHitsBounds(ghost, playArea) {
  const box = ghostBox(ghost);
  const groundTop = playArea.height - playArea.groundHeight;
  return box.top <= 0 || box.bottom >= groundTop;
}

export default { aabbIntersect, ghostHitsPipe, ghostHitsBounds };
