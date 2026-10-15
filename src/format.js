/**
 * format.js — Flappy Kiro score display formatting.
 *
 * Pure, side-effect-free formatting for the bottom-of-screen score readout.
 * The Renderer draws the string this returns (R9.10).
 *
 * _Requirements: 9.10_
 */

/**
 * Format the score display line.
 *
 * Produces exactly `"Score: {current} | High: {high}"`, where the integer
 * values are concatenated into the template (R9.10).
 *
 * Pure: no mutation, no globals.
 *
 * @param {number} current The current session score (non-negative integer).
 * @param {number} high The high score (non-negative integer).
 * @returns {string} The formatted score line.
 */
export function formatScore(current, high) {
  return "Score: " + current + " | High: " + high;
}

export default formatScore;
