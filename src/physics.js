/**
 * physics.js — Flappy Kiro pure physics module.
 *
 * Side-effect-free functions that advance the Ghost's vertical motion. Each
 * function returns a NEW ghost object and never mutates its input, so the
 * logic is deterministic and property-testable in isolation.
 *
 * All velocities are per-second constants (see config.js) scaled by the frame
 * delta. Canvas convention: origin top-left, Y increases downward, so upward
 * velocity is negative and gravity (a downward acceleration) is positive.
 *
 * Ghost shape: { x, y, vy, width, height }.
 *
 * _Requirements: 2.3, 3.1, 3.2, 3.3_
 */

import { CONFIG } from './config.js';

/**
 * Apply gravity for one frame: increase downward velocity by GRAVITY × dt,
 * clamped so it never exceeds MAX_FALL (R3.1, R3.3).
 *
 * @param {{x:number, y:number, vy:number, width:number, height:number}} ghost
 * @param {number} deltaSeconds Elapsed time for this frame, in seconds.
 * @returns {{x:number, y:number, vy:number, width:number, height:number}} A new ghost with updated vy.
 */
export function applyGravity(ghost, deltaSeconds) {
  const vy = Math.min(ghost.vy + CONFIG.GRAVITY * deltaSeconds, CONFIG.MAX_FALL);
  return { ...ghost, vy };
}

/**
 * Apply a flap: replace the Ghost's vertical velocity with the fixed upward
 * impulse, discarding any accumulated downward velocity (R2.3).
 *
 * @param {{x:number, y:number, vy:number, width:number, height:number}} ghost
 * @returns {{x:number, y:number, vy:number, width:number, height:number}} A new ghost with vy set to FLAP_IMPULSE.
 */
export function applyFlap(ghost) {
  return { ...ghost, vy: CONFIG.FLAP_IMPULSE };
}

/**
 * Integrate position from velocity for one frame: y += vy × dt (R3.2).
 *
 * @param {{x:number, y:number, vy:number, width:number, height:number}} ghost
 * @param {number} deltaSeconds Elapsed time for this frame, in seconds.
 * @returns {{x:number, y:number, vy:number, width:number, height:number}} A new ghost with updated y.
 */
export function integrate(ghost, deltaSeconds) {
  return { ...ghost, y: ghost.y + ghost.vy * deltaSeconds };
}
