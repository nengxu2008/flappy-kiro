/**
 * score.js — Flappy Kiro pure scoring and high-score module.
 *
 * Side-effect-free functions for current-session scoring and running
 * high-score tracking. Each function returns new values and never mutates its
 * inputs, so the logic is deterministic and property-testable in isolation.
 *
 * Scoring rule: a Pipe is counted exactly once, the first time the Ghost's
 * horizontal position passes the Pipe's right edge. A Pipe's right edge is
 * `pipe.x + pipe.width / 2` (pipe.x is the center-line). Already-scored pipes
 * are never re-counted (R6.2, R6.4, R6.5).
 *
 * Ghost shape: { x, y, vy, width, height }.
 * Pipe shape:  { x, gapY, gapHeight, width, scored }.
 *
 * _Requirements: 6.2, 6.4, 6.5, 7.1, 7.2, 7.6_
 */

/**
 * Mark each unscored Pipe whose right edge is left of the Ghost's horizontal
 * position as scored, counting each such Pipe once (R6.2, R6.5).
 *
 * Non-mutating: returns a new pipes array with new Pipe objects where the
 * `scored` flag flipped to true; unaffected pipes are returned unchanged.
 *
 * @param {{x:number, y:number, vy:number, width:number, height:number}} ghost
 * @param {Array<{x:number, gapY:number, gapHeight:number, width:number, scored:boolean}>} pipes
 * @returns {{pipes:Array<{x:number, gapY:number, gapHeight:number, width:number, scored:boolean}>, gained:number}}
 *   A new pipes array and the number of pipes newly scored this call.
 */
export function scorePasses(ghost, pipes) {
  let gained = 0;
  const nextPipes = pipes.map((pipe) => {
    const rightEdge = pipe.x + pipe.width / 2;
    if (!pipe.scored && rightEdge < ghost.x) {
      gained += 1;
      return { ...pipe, scored: true };
    }
    return pipe;
  });
  return { pipes: nextPipes, gained };
}

/**
 * Compute the running high score as the maximum of the current score and the
 * stored high score (R7.1, R7.2). Both inputs are expected to be non-negative
 * integers; the result is their maximum and therefore never decreases and
 * stays a non-negative integer (R7.6).
 *
 * @param {number} score Current session score (non-negative integer).
 * @param {number} highScore Stored high score (non-negative integer).
 * @returns {number} The greater of the two values.
 */
export function nextHighScore(score, highScore) {
  return Math.max(score, highScore);
}
