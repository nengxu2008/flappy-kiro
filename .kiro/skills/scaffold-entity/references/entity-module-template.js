/**
 * __entity__.js — Flappy Kiro pure __Entity__ module.
 *
 * Side-effect-free functions that create, advance, and collision-test the
 * __Entity__. Every function is pure: it reads its inputs, returns a NEW
 * object/array/boolean, and mutates nothing — so the logic is deterministic and
 * property-testable in isolation.
 *
 * Randomness (if any) flows through an injectable `rng: () => [0, 1)` so tests
 * can seed it. Time flows in as `deltaSeconds`. Never call Math.random() or read
 * the clock here.
 *
 * Canvas convention (shared across the game): origin top-left, Y increases
 * downward, upward velocity is negative. Motion constants are per-second values
 * in config.js, scaled by the frame delta each frame.
 *
 * __Entity__ shape: { x, y, vy, width, height /* , ...entity-specific fields *\/ }
 *   - x, y:   center position (center-origin convention)
 *   - vy:     vertical velocity, px/s (upward is negative)
 *   - width:  body width,  px
 *   - height: body height, px
 *
 * _Requirements: <fill in>_
 */

import CONFIG from './config.js';
import { aabbIntersect } from './collision.js';

/**
 * Create a new __Entity__ as a plain data object (not a class instance).
 * Randomized fields are drawn from the injected `rng` so spawns are
 * deterministic under test.
 *
 * @param {() => number} rng       Returns a value in [0, 1).
 * @param {{ width: number, height: number, groundHeight: number }} playArea
 * @returns {{ x: number, y: number, vy: number, width: number, height: number }}
 */
export function create__Entity__(rng, playArea) {
  // TODO: derive the spawn position/fields from CONFIG and rng.
  return {
    x: playArea.width + CONFIG.__ENTITY___WIDTH / 2, // spawn just off the right edge
    y: rng() * playArea.height,
    vy: 0,
    width: CONFIG.__ENTITY___WIDTH,
    height: CONFIG.__ENTITY___HEIGHT,
  };
}

/**
 * Advance every __Entity__ by one frame: move at CONFIG.__ENTITY___SPEED
 * (px/s) scaled by deltaSeconds. Returns a NEW array of NEW objects; inputs are
 * not mutated. The per-frame delta is hoisted out of the map so it is computed
 * once, not per element.
 *
 * @param {Array<object>} entities
 * @param {number} deltaSeconds  Elapsed time this frame, in seconds.
 * @returns {Array<object>} New array with advanced positions.
 */
export function advance__Entity__s(entities, deltaSeconds) {
  const dx = CONFIG.__ENTITY___SPEED * deltaSeconds;
  return entities.map((entity) => ({ ...entity, x: entity.x - dx }));
}

/**
 * Remove __Entity__ instances that have fully scrolled past the left edge
 * (right edge x + width/2 at or below 0). Survivors are retained by reference;
 * returns a new array.
 *
 * @param {Array<object>} entities
 * @returns {Array<object>} New array of still-visible entities.
 */
export function cull__Entity__sOffscreen(entities) {
  return entities.filter((entity) => entity.x + entity.width / 2 > 0);
}

/**
 * Compute the AABB of a center-origin entity.
 *
 * @param {{ x: number, y: number, width: number, height: number }} e
 * @returns {{ left: number, top: number, right: number, bottom: number }}
 */
function boxOf(e) {
  const halfW = e.width / 2;
  const halfH = e.height / 2;
  return {
    left: e.x - halfW,
    top: e.y - halfH,
    right: e.x + halfW,
    bottom: e.y + halfH,
  };
}

/**
 * Pure AABB collision test between the Ghost and a single __Entity__. Four
 * comparisons via aabbIntersect — no distance math, no trig, no broad-phase.
 * Returns a boolean and never transitions game state (the state manager, only
 * while Playing, turns a true into a transition).
 *
 * @param {{ x: number, y: number, width: number, height: number }} ghost
 * @param {{ x: number, y: number, width: number, height: number }} entity
 * @returns {boolean} true when the Ghost overlaps the __Entity__.
 */
export function ghostHits__Entity__(ghost, entity) {
  return aabbIntersect(boxOf(ghost), boxOf(entity));
}

export default {
  create__Entity__,
  advance__Entity__s,
  cull__Entity__sOffscreen,
  ghostHits__Entity__,
};
