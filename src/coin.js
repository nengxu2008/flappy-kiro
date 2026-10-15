/**
 * coin.js — Flappy Kiro pure Coin module.
 *
 * Side-effect-free functions that create, advance, collect, cull, and
 * collision-test Coins — the collectibles Ghosty grabs for bonus points. Every
 * function is pure: it reads its inputs, returns a NEW object/array/boolean, and
 * mutates nothing, so the logic is deterministic and property-testable in
 * isolation (mirrors pipeManager.js and score.js).
 *
 * Randomness for the spawn height flows through an injectable `rng: () => [0, 1)`
 * so tests can seed it. Time flows in as `deltaSeconds`. Never call
 * Math.random() or read the clock here.
 *
 * Canvas convention: origin top-left, Y increases downward, upward velocity is
 * negative. A Coin's `x`/`y` is its CENTER (center-origin box). Motion is the
 * per-second CONFIG.COIN_SPEED scaled by the frame delta each frame.
 *
 * Coin shape: { x, y, width, height, collected }
 *   - x, y:      center position (center-origin convention)
 *   - width:     coin body width,  px
 *   - height:    coin body height, px
 *   - collected: true once the Ghost has picked the Coin up (counted once)
 *
 * _Requirements: bonus scoring (Coin collectible)_
 */

import CONFIG from './config.js';
import { aabbIntersect } from './collision.js';

/**
 * Create a new Coin as a plain data object (not a class instance). The coin
 * spawns at `spawnX` (just off the right edge, like a pipe) with its vertical
 * center drawn from the injected `rng` within the playable vertical span, so
 * spawns are deterministic under a seeded rng.
 *
 * The y center is drawn uniformly in
 *   [COIN_HEIGHT, playArea.height - playArea.groundHeight - COIN_HEIGHT]
 * then clamped so a degenerate play area still yields a valid y.
 *
 * @param {() => number} rng Returns a value in [0, 1) for the spawn height.
 * @param {{ width: number, height: number, groundHeight: number }} playArea
 * @param {number} spawnX Center-line X where the coin enters, just off-screen.
 * @returns {{ x: number, y: number, width: number, height: number, collected: boolean }}
 */
export function createCoin(rng, playArea, spawnX) {
  const minY = CONFIG.COIN_HEIGHT;
  const maxY = playArea.height - playArea.groundHeight - CONFIG.COIN_HEIGHT;

  // Uniform sample in [minY, maxY]. If the span collapses (degenerate play
  // area), fall back to the single valid center so y stays well-defined.
  const span = Math.max(0, maxY - minY);
  const y = minY + rng() * span;

  return {
    x: spawnX,
    y,
    width: CONFIG.COIN_WIDTH,
    height: CONFIG.COIN_HEIGHT,
    collected: false,
  };
}

/**
 * Advance every Coin by one frame: scroll left at CONFIG.COIN_SPEED (px/s)
 * scaled by deltaSeconds. Returns a NEW array of NEW objects; inputs are not
 * mutated. The per-frame delta is hoisted out of the map so it is computed once,
 * not per element.
 *
 * @param {Array<object>} coins
 * @param {number} deltaSeconds Elapsed time this frame, in seconds.
 * @returns {Array<object>} New array with advanced x positions.
 */
export function advanceCoins(coins, deltaSeconds) {
  const dx = CONFIG.COIN_SPEED * deltaSeconds;
  return coins.map((coin) => ({ ...coin, x: coin.x - dx }));
}

/**
 * Mark each not-yet-collected Coin the Ghost currently overlaps as collected,
 * counting each such Coin once. Mirrors the exact pattern of `scorePasses` in
 * score.js.
 *
 * Non-mutating: returns a new coins array with new Coin objects where the
 * `collected` flag flipped to true; unaffected coins are returned unchanged
 * (same reference).
 *
 * @param {{ x: number, y: number, width: number, height: number }} ghost
 * @param {Array<{ x:number, y:number, width:number, height:number, collected:boolean }>} coins
 * @returns {{ coins: Array<object>, gained: number }}
 *   A new coins array and the number of coins newly collected this call.
 */
export function collectCoins(ghost, coins) {
  let gained = 0;
  const nextCoins = coins.map((coin) => {
    if (!coin.collected && ghostHitsCoin(ghost, coin)) {
      gained += 1;
      return { ...coin, collected: true };
    }
    return coin;
  });
  return { coins: nextCoins, gained };
}

/**
 * Remove Coins that have either scrolled fully past the left edge (right edge
 * x + width/2 at or below 0) or already been collected. Survivors are retained
 * by reference; returns a new array.
 *
 * @param {Array<object>} coins
 * @returns {Array<object>} New array of still-active coins.
 */
export function cullCoins(coins) {
  return coins.filter((coin) => coin.x + coin.width / 2 > 0 && !coin.collected);
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
 * Pure AABB collision test between the Ghost and a single Coin. Four
 * comparisons via aabbIntersect — no distance math, no trig, no broad-phase.
 * Returns a boolean and never transitions game state (the state manager, only
 * while Playing, turns a true into a collected coin + bonus).
 *
 * @param {{ x: number, y: number, width: number, height: number }} ghost
 * @param {{ x: number, y: number, width: number, height: number }} coin
 * @returns {boolean} true when the Ghost overlaps the Coin.
 */
export function ghostHitsCoin(ghost, coin) {
  return aabbIntersect(boxOf(ghost), boxOf(coin));
}

export default {
  createCoin,
  advanceCoins,
  collectCoins,
  cullCoins,
  ghostHitsCoin,
};
