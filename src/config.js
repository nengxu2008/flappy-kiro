/**
 * config.js — Flappy Kiro constants module.
 *
 * The single source of truth for every tunable value in the game: Play_Area
 * dimensions, physics constants, pipe/cloud parameters, and timing windows.
 *
 * Requirement acceptance values stated per animation frame (gravity, max fall,
 * flap impulse) are converted to per-second constants assuming the 60 FPS
 * reference, then scaled by delta time each frame so motion stays frame-rate
 * independent (see design.md "Per-Frame to Per-Second Constant Conversion").
 *
 * Canvas convention: origin top-left, Y increases downward, upward velocity is
 * negative.
 *
 * The exported object is frozen so no module can mutate shared configuration.
 *
 * _Requirements: 3.1, 3.3, 2.3, 4.1, 4.2, 4.4, 4.5, 9.3, 9.5, 9.6_
 */

// --- Play_Area (fixed logical coordinate space) ---
// Fixed internal resolution the canvas renders into (design.md: 480×640).
const WIDTH = 480;
const HEIGHT = 640;
// Dark gray Ground strip height along the bottom edge (R9.9).
const GROUND_HEIGHT = 80;

// --- Ghost dimensions ---
// Rendered size for assets/ghosty.png, scaled to fit the Play_Area (R9.1).
const GHOST_WIDTH = 36;
const GHOST_HEIGHT = 36;

// --- Physics (per-second constants @ 60 FPS reference) ---
// Gravity: 0.30 px/frame² × 60 × 60 (R3.1, range 0.3–0.6 px/frame²). Minimum of the range for the gentlest fall.
const GRAVITY = 1080; // px/s²
// Max downward velocity: 8 px/frame × 60 (R3.3, range 8–15 px/frame). Minimum of the range for the slowest terminal drop.
const MAX_FALL = 480; // px/s
// Flap impulse: -6.5 px/frame × 60 (R2.3). Negative = upward. Softer to match the gentlest gravity.
const FLAP_IMPULSE = -390; // px/s

// --- Pipes ---
// Scroll speed (R4.1, range 120–200 px/s). Minimum of the range for the slowest approach.
const PIPE_SPEED = 120; // px/s
// Center-to-center horizontal spacing between consecutive pipes (R4.2, 200–350 px). Maximum of the range for the most recovery room.
const PIPE_SPACING = 350; // px
// Vertical margin keeping the gap off both the ceiling and the ground (R4.4, ≥50 px).
const GAP_MARGIN = 60; // px
// Gap height factor; GAP_HEIGHT = GAP_HEIGHT_FACTOR × ghost height (R4.5, ≥2×). Widened further for a much easier gap to clear.
const GAP_HEIGHT_FACTOR = 4.0;
const GAP_HEIGHT = GAP_HEIGHT_FACTOR * GHOST_HEIGHT; // px
// Pipe body width.
const PIPE_WIDTH = 60; // px

// --- Coins (collectible bonus) ---
// Collectible coin size (R: bonus scoring).
const COIN_WIDTH = 24; // px
const COIN_HEIGHT = 24; // px
// Coin scroll speed mirrors PIPE_SPEED so coins drift with the world (R4.1 analog).
const COIN_SPEED = 120; // px/s (= PIPE_SPEED)
// Bonus points per coin (R: bonus scoring). Integer.
const COIN_BONUS = 5;

// --- Clouds (parallax background) ---
// Per-cloud horizontal speeds: at least two distinct values, all strictly less
// than PIPE_SPEED (R9.5, R9.6).
const CLOUD_SPEEDS = [20, 45]; // px/s
// Fixed cloud opacity range so the background shows through (R9.3).
const CLOUD_OPACITY_MIN = 0.3;
const CLOUD_OPACITY_MAX = 0.7;

// --- Timing ---
// Flap_Input events are ignored for this long after entering Game_Over (R8.4).
const GAME_OVER_IGNORE_MS = 500; // ms
// Asset-load watchdog so the Ready_State is reached even if an asset is slow (R1.1).
const ASSET_WATCHDOG_MS = 3000; // ms
// Max frame delta to avoid a physics "teleport" after a tab pause/stall (R10.4).
const MAX_DELTA_SECONDS = 0.05; // s (~20 FPS floor)

/**
 * Frozen single source of truth for all game constants.
 * @type {Readonly<object>}
 */
export const CONFIG = Object.freeze({
  playArea: Object.freeze({
    width: WIDTH,
    height: HEIGHT,
    groundHeight: GROUND_HEIGHT,
  }),

  ghost: Object.freeze({
    width: GHOST_WIDTH,
    height: GHOST_HEIGHT,
  }),

  // Physics (per-second @ 60 FPS reference; upward is negative Y).
  GRAVITY,
  MAX_FALL,
  FLAP_IMPULSE,

  // Pipes.
  PIPE_SPEED,
  PIPE_SPACING,
  GAP_MARGIN,
  GAP_HEIGHT_FACTOR,
  GAP_HEIGHT,
  PIPE_WIDTH,

  // Coins.
  COIN_WIDTH,
  COIN_HEIGHT,
  COIN_SPEED,
  COIN_BONUS,

  // Clouds.
  CLOUD_SPEEDS: Object.freeze([...CLOUD_SPEEDS]),
  CLOUD_OPACITY_MIN,
  CLOUD_OPACITY_MAX,

  // Timing.
  GAME_OVER_IGNORE_MS,
  ASSET_WATCHDOG_MS,
  MAX_DELTA_SECONDS,
});

export default CONFIG;
