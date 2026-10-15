/**
 * coin.property.test.js — property-based tests for the pure Coin module.
 *
 * Mirrors src/coin.js and the style of test/pipeManager.property.test.js and
 * test/score.property.test.js. Uses fast-check (the project's standard PBT lib —
 * do not hand-roll property testing). Every property runs a minimum of 100
 * iterations and is tagged `// Feature: flappy-kiro, Property {n}: {text}`.
 *
 * These cover the pure logic only. The renderer draw helper (a side effect) is
 * tested with example assertions and a mocked ctx in test/renderer.test.js.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

import {
  createCoin,
  advanceCoins,
  collectCoins,
  cullCoins,
  ghostHitsCoin,
} from '../src/coin.js';
import { CONFIG } from '../src/config.js';

const RUNS = { numRuns: 100 };

// A deterministic rng from a seed in [0,1), for reproducible spawns.
const seededRng = (seed) => () => seed;

// Arbitrary for a single coin matching the design shape.
const coinArb = fc.record({
  x: fc.double({ min: -500, max: 1000, noNaN: true }),
  y: fc.double({ min: -500, max: 1000, noNaN: true }),
  width: fc.double({ min: 1, max: 100, noNaN: true }),
  height: fc.double({ min: 1, max: 100, noNaN: true }),
  collected: fc.boolean(),
});

// Feature: flappy-kiro, Property 1: advancing coins is non-mutating
describe('Property 1: advanceCoins does not mutate its input array or elements', () => {
  it('leaves the input array and every element untouched', () => {
    fc.assert(
      fc.property(
        fc.array(coinArb, { maxLength: 20 }),
        fc.double({ min: 0, max: 0.05, noNaN: true }),
        (coins, dt) => {
          // structuredClone preserves -0 (JSON round-tripping does not), so the
          // non-mutation check stays faithful for signed-zero coordinates.
          const snapshot = structuredClone(coins);
          const advanced = advanceCoins(coins, dt);
          // Inputs unchanged.
          expect(coins).toEqual(snapshot);
          // A new array of new objects is returned.
          if (coins.length > 0) {
            expect(advanced[0]).not.toBe(coins[0]);
          }
        },
      ),
      RUNS,
    );
  });
});

// Feature: flappy-kiro, Property 2: coins scroll left at COIN_SPEED * dt
describe('Property 2: advanceCoins moves every coin left and distance scales with dt', () => {
  it('moves each coin x to x - COIN_SPEED * dt and scales with deltaSeconds', () => {
    fc.assert(
      fc.property(
        fc.array(coinArb, { maxLength: 20 }),
        fc.double({ min: 0, max: 0.05, noNaN: true }),
        (coins, dt) => {
          const advanced = advanceCoins(coins, dt);
          expect(advanced).toHaveLength(coins.length);
          advanced.forEach((coin, i) => {
            expect(coin.x).toBe(coins[i].x - CONFIG.COIN_SPEED * dt);
            // Each coin moves left (or stays put when dt === 0).
            expect(coin.x).toBeLessThanOrEqual(coins[i].x);
            // Non-x fields are preserved.
            expect(coin.y).toBe(coins[i].y);
            expect(coin.width).toBe(coins[i].width);
            expect(coin.height).toBe(coins[i].height);
            expect(coin.collected).toBe(coins[i].collected);
          });
        },
      ),
      RUNS,
    );
  });
});

// Feature: flappy-kiro, Property 3: coin spawning is deterministic and in-bounds
describe('Property 3: createCoin is deterministic for a fixed seed and spawns within the playable span', () => {
  it('produces identical coins for identical seeds and keeps y within the vertical span', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 0.999, noNaN: true }),
        fc.double({ min: -1e4, max: 1e4, noNaN: true }),
        (seed, spawnX) => {
          const playArea = CONFIG.playArea;
          const a = createCoin(seededRng(seed), playArea, spawnX);
          const b = createCoin(seededRng(seed), playArea, spawnX);
          // Deterministic under a fixed seed.
          expect(a).toEqual(b);
          // Spawn x is exactly the requested center-line.
          expect(a.x).toBe(spawnX);
          // y stays within [COIN_HEIGHT, groundTop - COIN_HEIGHT].
          const minY = CONFIG.COIN_HEIGHT;
          const maxY =
            playArea.height - playArea.groundHeight - CONFIG.COIN_HEIGHT;
          expect(a.y).toBeGreaterThanOrEqual(minY);
          expect(a.y).toBeLessThanOrEqual(maxY);
          // Spawned coins start uncollected with the configured size.
          expect(a.collected).toBe(false);
          expect(a.width).toBe(CONFIG.COIN_WIDTH);
          expect(a.height).toBe(CONFIG.COIN_HEIGHT);
        },
      ),
      RUNS,
    );
  });
});

// Feature: flappy-kiro, Property 4: collecting coins is non-mutating and counts overlaps once
describe('Property 4: collectCoins flips overlapping coins to collected and counts gained', () => {
  it('collects exactly the coins the ghost overlaps and never re-counts', () => {
    fc.assert(
      fc.property(fc.array(coinArb, { maxLength: 20 }), (coins) => {
        // A ghost centered on the origin with a 1x1 box.
        const ghost = { x: 0, y: 0, width: 1, height: 1 };
        // structuredClone preserves -0 (JSON round-tripping does not), so the
        // non-mutation check stays faithful for signed-zero coordinates.
        const snapshot = structuredClone(coins);

        const { coins: result, gained } = collectCoins(ghost, coins);

        // Non-mutating: the input array/elements are unchanged.
        expect(coins).toEqual(snapshot);
        expect(result).toHaveLength(coins.length);

        // gained equals the number of coins that flipped to collected.
        let flipped = 0;
        result.forEach((coin, i) => {
          const was = coins[i].collected;
          if (!was && coin.collected) {
            flipped += 1;
            // A flip only happens where the ghost overlaps.
            expect(ghostHitsCoin(ghost, coins[i])).toBe(true);
          } else {
            // Unchanged coins keep their collected flag and are same reference.
            expect(coin.collected).toBe(was);
            expect(coin).toBe(coins[i]);
          }
        });
        expect(gained).toBe(flipped);
        expect(Number.isInteger(gained)).toBe(true);
        expect(gained).toBeGreaterThanOrEqual(0);

        // Re-running on the result collects nothing new (counted once).
        const rerun = collectCoins(ghost, result);
        expect(rerun.gained).toBe(0);
      }),
      RUNS,
    );
  });

  it('collects nothing when the ghost is far away', () => {
    fc.assert(
      fc.property(fc.array(coinArb, { maxLength: 20 }), (coins) => {
        // A ghost placed far to the right of every coin cannot overlap any.
        const ghost = { x: 1e6, y: 1e6, width: 1, height: 1 };
        const { coins: result, gained } = collectCoins(ghost, coins);
        expect(gained).toBe(0);
        // No coin's collected flag changed.
        result.forEach((coin, i) => {
          expect(coin.collected).toBe(coins[i].collected);
        });
      }),
      RUNS,
    );
  });
});

// Feature: flappy-kiro, Property 5: culling drops collected and offscreen-left coins
describe('Property 5: cullCoins drops collected or offscreen-left coins and keeps the rest', () => {
  it('retains exactly the active, onscreen coins by reference', () => {
    fc.assert(
      fc.property(fc.array(coinArb, { maxLength: 20 }), (coins) => {
        const survivors = cullCoins(coins);

        const expected = coins.filter(
          (coin) => coin.x + coin.width / 2 > 0 && !coin.collected,
        );
        expect(survivors).toHaveLength(expected.length);

        // Order preserved and survivors are the same objects (unchanged).
        expected.forEach((coin, i) => {
          expect(survivors[i]).toBe(coin);
        });

        // Every survivor is onscreen and uncollected.
        survivors.forEach((coin) => {
          expect(coin.x + coin.width / 2).toBeGreaterThan(0);
          expect(coin.collected).toBe(false);
        });
      }),
      RUNS,
    );
  });
});

// Feature: flappy-kiro, Property 6: AABB coin collision agrees with geometry
describe('Property 6: ghostHitsCoin is true for overlap and false for clear separation', () => {
  it('reports overlap at the coin center and no overlap when far apart', () => {
    fc.assert(
      fc.property(coinArb, (coin) => {
        // A tiny ghost placed exactly on the coin center must overlap.
        const overlapping = { x: coin.x, y: coin.y, width: 1, height: 1 };
        expect(ghostHitsCoin(overlapping, coin)).toBe(true);

        // A ghost moved far to the right cannot overlap.
        const separated = {
          x: coin.x + coin.width + 1000,
          y: coin.y,
          width: 1,
          height: 1,
        };
        expect(ghostHitsCoin(separated, coin)).toBe(false);
      }),
      RUNS,
    );
  });
});
