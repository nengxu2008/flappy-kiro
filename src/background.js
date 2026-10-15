/**
 * background.js — Flappy Kiro pure background (parallax clouds) module.
 *
 * Side-effect-free functions that lay out and advance the decorative Clouds
 * scrolling across the background. Clouds move right-to-left at per-cloud
 * speeds slower than the pipes, producing a parallax effect, and wrap back to
 * the right edge once they scroll fully off the left (R9.4, R9.7).
 *
 * `advanceClouds` returns a NEW array of NEW cloud objects and never mutates
 * its input, so the logic is deterministic and property-testable in isolation.
 *
 * Canvas convention: origin top-left, X increases to the right. The Play_Area
 * left edge is x = 0 and the right edge is x = playArea.width.
 *
 * Cloud shape: { x, y, width, height, speed, opacity }.
 *
 * _Requirements: 9.3, 9.4, 9.5, 9.6, 9.7_
 */

import { CONFIG } from './config.js';

/**
 * Advance every Cloud one frame: move left by speed × dt, and when a Cloud's
 * right edge passes the Play_Area's left edge (x = 0), reposition it so it
 * re-enters from the right edge (R9.4, R9.7).
 *
 * Non-mutating: returns a new array of new cloud objects.
 *
 * @param {Array<{x:number, y:number, width:number, height:number, speed:number, opacity:number}>} clouds
 * @param {number} deltaSeconds Elapsed time for this frame, in seconds.
 * @param {{width:number, height:number, groundHeight:number}} playArea
 * @returns {Array<{x:number, y:number, width:number, height:number, speed:number, opacity:number}>} New advanced clouds.
 */
export function advanceClouds(clouds, deltaSeconds, playArea) {
  return clouds.map((cloud) => {
    let x = cloud.x - cloud.speed * deltaSeconds;
    // Wrap when the cloud's right edge has moved past the left edge (x = 0):
    // reposition so the cloud re-enters from at/beyond the right edge.
    if (x + cloud.width < 0) {
      x = playArea.width;
    }
    return { ...cloud, x };
  });
}

/**
 * Create a parallax cloud layout within the background region above the Ground.
 *
 * Each Cloud is assigned a `speed` cycled from `CLOUD_SPEEDS` so the set
 * contains at least two distinct values and every speed is strictly less than
 * `PIPE_SPEED` (R9.5, R9.6), and an `opacity` within the configured range
 * [CLOUD_OPACITY_MIN, CLOUD_OPACITY_MAX] (R9.3). Clouds are placed across the
 * Play_Area width and vertically within the region above the Ground (R9.2).
 *
 * Randomness flows through an injectable `rng` so tests can seed it
 * deterministically; it defaults to `Math.random`.
 *
 * @param {{width:number, height:number, groundHeight:number}} [playArea=CONFIG.playArea]
 * @param {number} [count=4] Number of clouds to create (at least 2).
 * @param {() => number} [rng=Math.random] Returns a value in [0, 1).
 * @returns {Array<{x:number, y:number, width:number, height:number, speed:number, opacity:number}>}
 */
export function createClouds(playArea = CONFIG.playArea, count = 4, rng = Math.random) {
  const speeds = CONFIG.CLOUD_SPEEDS;
  const opacityMin = CONFIG.CLOUD_OPACITY_MIN;
  const opacityMax = CONFIG.CLOUD_OPACITY_MAX;
  const opacityRange = opacityMax - opacityMin;

  // Ensure at least two clouds so the parallax set can hold ≥2 distinct speeds.
  const n = Math.max(2, Math.floor(count));

  // Vertical band for cloud centers: within the background region above the
  // Ground, leaving room for the cloud body (R9.2).
  const backgroundHeight = playArea.height - playArea.groundHeight;

  const clouds = [];
  for (let i = 0; i < n; i++) {
    const width = 70 + Math.floor(rng() * 40); // 70–110 px
    const height = 36 + Math.floor(rng() * 20); // 36–56 px

    // Spread clouds horizontally across (and a little beyond) the Play_Area so
    // they do not all overlap, then let advanceClouds scroll/wrap them.
    const x = rng() * playArea.width;

    // Keep the whole cloud body within the background region above the Ground.
    const maxY = Math.max(0, backgroundHeight - height);
    const y = rng() * maxY;

    // Cycle through CLOUD_SPEEDS so ≥2 distinct speeds are guaranteed when
    // n ≥ 2; every CLOUD_SPEEDS value is < PIPE_SPEED by config invariant.
    const speed = speeds[i % speeds.length];

    const opacity = opacityMin + rng() * opacityRange;

    clouds.push({ x, y, width, height, speed, opacity });
  }

  return clouds;
}

export default { advanceClouds, createClouds };
