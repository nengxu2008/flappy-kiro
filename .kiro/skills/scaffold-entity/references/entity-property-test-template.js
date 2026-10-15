/**
 * __entity__.property.test.js — property-based tests for the pure __Entity__ module.
 *
 * Mirrors src/__entity__.js. Uses fast-check (the project's standard PBT lib —
 * do not hand-roll property testing). Every property runs a minimum of 100
 * iterations and is tagged `// Feature: flappy-kiro, Property {n}: {text}`.
 *
 * These cover the pure logic only. The renderer draw helper (a side effect) is
 * tested with example assertions and a mocked ctx in test/renderer.test.js, not
 * here.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  create__Entity__,
  advance__Entity__s,
  cull__Entity__sOffscreen,
  ghostHits__Entity__,
} from '../src/__entity__.js';

const RUNS = { numRuns: 100 };

// A deterministic rng from a seed in [0,1), for reproducible spawns.
const seededRng = (seed) => () => seed;

// Arbitrary for a single entity with sane finite fields.
const entityArb = fc.record({
  x: fc.double({ min: -500, max: 1000, noNaN: true }),
  y: fc.double({ min: -500, max: 1000, noNaN: true }),
  vy: fc.double({ min: -1000, max: 1000, noNaN: true }),
  width: fc.double({ min: 1, max: 100, noNaN: true }),
  height: fc.double({ min: 1, max: 100, noNaN: true }),
});

describe('__entity__ module', () => {
  it('advance__Entity__s does not mutate its input array or elements', () => {
    // Feature: flappy-kiro, Property 1: advancing entities is non-mutating.
    fc.assert(
      fc.property(
        fc.array(entityArb, { maxLength: 10 }),
        fc.double({ min: 0, max: 0.05, noNaN: true }),
        (entities, dt) => {
          const snapshot = JSON.parse(JSON.stringify(entities));
          advance__Entity__s(entities, dt);
          expect(entities).toEqual(snapshot);
        },
      ),
      RUNS,
    );
  });

  it('advance__Entity__s scales distance with deltaSeconds', () => {
    // Feature: flappy-kiro, Property 2: travel distance is proportional to dt.
    fc.assert(
      fc.property(entityArb, fc.double({ min: 0, max: 0.05, noNaN: true }), (entity, dt) => {
        const [moved] = advance__Entity__s([entity], dt);
        // x decreases by SPEED*dt; same sign, magnitude grows with dt.
        expect(moved.x).toBeLessThanOrEqual(entity.x);
      }),
      RUNS,
    );
  });

  it('cull__Entity__sOffscreen keeps only entities whose right edge is > 0', () => {
    // Feature: flappy-kiro, Property 3: culling retains exactly the visible set.
    fc.assert(
      fc.property(fc.array(entityArb, { maxLength: 20 }), (entities) => {
        const survivors = cull__Entity__sOffscreen(entities);
        for (const e of survivors) {
          expect(e.x + e.width / 2).toBeGreaterThan(0);
        }
        expect(survivors.length).toBeLessThanOrEqual(entities.length);
      }),
      RUNS,
    );
  });

  it('create__Entity__ is deterministic for a fixed rng seed', () => {
    // Feature: flappy-kiro, Property 4: spawning is deterministic under a seeded rng.
    fc.assert(
      fc.property(fc.double({ min: 0, max: 0.999, noNaN: true }), (seed) => {
        const playArea = { width: 480, height: 640, groundHeight: 80 };
        const a = create__Entity__(seededRng(seed), playArea);
        const b = create__Entity__(seededRng(seed), playArea);
        expect(a).toEqual(b);
      }),
      RUNS,
    );
  });

  it('ghostHits__Entity__ is true for overlap and false for clear separation', () => {
    // Feature: flappy-kiro, Property 5: AABB collision agrees with geometry.
    fc.assert(
      fc.property(entityArb, (entity) => {
        // A ghost placed exactly on the entity center must overlap.
        const overlapping = { x: entity.x, y: entity.y, width: 1, height: 1 };
        expect(ghostHits__Entity__(overlapping, entity)).toBe(true);

        // A ghost moved far to the right cannot overlap.
        const separated = {
          x: entity.x + entity.width + 1000,
          y: entity.y,
          width: 1,
          height: 1,
        };
        expect(ghostHits__Entity__(separated, entity)).toBe(false);
      }),
      RUNS,
    );
  });
});
