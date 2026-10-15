/**
 * pipeManager.js — Flappy Kiro pure pipe-management core.
 *
 * Side-effect-free functions that generate, scroll, and cull Pipes. All core
 * functions are non-mutating: they return new objects/arrays and never alter
 * their inputs, so they can be unit- and property-tested deterministically.
 *
 * Randomness for gap selection flows through an injectable `rng: () => [0, 1)`
 * so tests can seed it and still exercise the full range.
 *
 * Canvas convention: origin top-left, Y increases downward. A Pipe's `x` is its
 * center-line, scrolling right-to-left over time.
 *
 * Pipe shape: { x, gapY, gapHeight, width, scored }
 *   - x:         center-line X (R4.1 scroll target)
 *   - gapY:      vertical center of the Gap (R4.4)
 *   - gapHeight: fixed Gap height, ≥ 2× ghost height (R4.5)
 *   - width:     pipe body width
 *   - scored:    true once the Pipe has been counted toward the Score
 *
 * _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6_
 */

import CONFIG from "./config.js";

/**
 * Generate a new Pipe positioned PIPE_SPACING to the right of the previous one,
 * with a Gap whose vertical center is chosen uniformly at random within the
 * Play_Area margins.
 *
 * The gap center is drawn uniformly in
 *   [GAP_MARGIN + GAP_HEIGHT/2, playArea.height - groundHeight - GAP_MARGIN - GAP_HEIGHT/2]
 * which guarantees the Gap's top edge sits at least GAP_MARGIN below the Ceiling
 * and its bottom edge at least GAP_MARGIN above the Ground (R4.4). The Gap
 * height is the fixed CONFIG.GAP_HEIGHT (≥ 2× ghost height, R4.5).
 *
 * @param {() => number} rng - Returns a value in [0, 1) for gap selection.
 * @param {{ width: number, height: number, groundHeight: number }} playArea
 * @param {number} lastPipeX - Center-line X of the previously generated Pipe.
 * @returns {{ x: number, gapY: number, gapHeight: number, width: number, scored: boolean }}
 */
export function spawnPipe(rng, playArea, lastPipeX) {
  const gapHeight = CONFIG.GAP_HEIGHT;

  // Playable vertical span runs from the Ceiling (y=0) to the top of the Ground.
  const minGapCenter = CONFIG.GAP_MARGIN + gapHeight / 2;
  const maxGapCenter =
    playArea.height - playArea.groundHeight - CONFIG.GAP_MARGIN - gapHeight / 2;

  // Uniform sample in [minGapCenter, maxGapCenter]. If the span collapses
  // (degenerate play area), fall back to the single valid center.
  const span = Math.max(0, maxGapCenter - minGapCenter);
  const gapY = minGapCenter + rng() * span;

  return {
    x: lastPipeX + CONFIG.PIPE_SPACING,
    gapY,
    gapHeight,
    width: CONFIG.PIPE_WIDTH,
    scored: false,
  };
}

/**
 * Scroll every Pipe left by PIPE_SPEED × deltaSeconds (R4.1). Returns a new
 * array of new Pipe objects; inputs are not mutated.
 *
 * @param {Array<object>} pipes
 * @param {number} deltaSeconds - Elapsed time since the last frame, in seconds.
 * @returns {Array<object>} New pipe array with advanced x positions.
 */
export function advancePipes(pipes, deltaSeconds) {
  const dx = CONFIG.PIPE_SPEED * deltaSeconds;
  return pipes.map((pipe) => ({ ...pipe, x: pipe.x - dx }));
}

/**
 * Remove Pipes that have fully scrolled past the left edge of the Play_Area —
 * i.e. whose right edge (x + width/2) is at or below 0 (R4.6). Every other
 * Pipe is retained unchanged (same object reference). Returns a new array.
 *
 * @param {Array<object>} pipes
 * @param {{ width: number, height: number, groundHeight: number }} playArea
 * @returns {Array<object>} New array containing only the still-visible pipes.
 */
export function cullOffscreen(pipes, playArea) {
  return pipes.filter((pipe) => pipe.x + pipe.width / 2 > 0);
}

/**
 * Decide whether a new Pipe should be spawned: true when there are no Pipes, or
 * when the right-most (most recently generated, largest-x) Pipe has scrolled
 * far enough left that the next Pipe's center would still be within the spawn
 * horizon — i.e. the center-to-center spacing interval has been reached (R4.2).
 *
 * A new Pipe is due once the last Pipe's center sits at or to the left of
 * `playArea.width + PIPE_SPACING - PIPE_SPACING` = `playArea.width`, keeping the
 * next spawn PIPE_SPACING to its right (off the right edge, R4.3).
 *
 * @param {Array<object>} pipes
 * @param {{ width: number, height: number, groundHeight: number }} playArea
 * @returns {boolean} True when a new Pipe should be generated.
 */
export function needsSpawn(pipes, playArea) {
  if (pipes.length === 0) {
    return true;
  }
  // The most recently generated pipe has the greatest x (newest, furthest right).
  const lastPipeX = pipes.reduce((max, pipe) => Math.max(max, pipe.x), -Infinity);
  // Spawn when the gap to the right edge has grown to a full spacing interval,
  // so the next pipe lands PIPE_SPACING to the right of the last one.
  return lastPipeX <= playArea.width - CONFIG.PIPE_SPACING;
}

export default { spawnPipe, advancePipes, cullOffscreen, needsSpawn };
