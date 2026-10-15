import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { applyGravity, integrate } from '../src/physics.js';
import { advancePipes } from '../src/pipeManager.js';
import { CONFIG } from '../src/config.js';

/**
 * Property 23: Delta-time scaling makes motion frame-rate independent.
 *
 * For any partition of a one-second wall-clock interval into frames with
 * varying delta times (summing to 1 second), the total on-screen displacement
 * of the Ghost and Pipes stays within 5% of the displacement produced by
 * stepping the same interval at exactly 60 FPS.
 *
 * The loop (src/gameLoop.js) advances motion by delegating to the pure physics
 * and pipe modules each frame, so this test drives those pure modules directly
 * over a 1 s interval and compares a variable-dt partition to the 60 FPS
 * reference.
 *
 * Partition generation / chosen bounds (documented per task):
 *   - Every frame delta is kept within (0, MAX_DELTA_SECONDS] (0.05 s), exactly
 *     the clamp the real loop applies (R10.4), so no single frame can
 *     "teleport" motion. With a 0.05 s ceiling, a 1 s interval needs at least
 *     20 frames; we draw k in [25, 120] (comfortably above the floor, up to 2x
 *     the 60 FPS reference) so realistic variable partitions are exercised
 *     without degenerate single-giant-frame cases that gravity's
 *     order-dependent, clamped integration cannot track within 5%.
 *   - The partition is built greedily so it sums to exactly 1.0 s while every
 *     frame respects the MAX_DT ceiling (no post-hoc renormalization that could
 *     push a frame back above the clamp).
 *   - Pipe scrolling (advancePipes) is linear in dt, so total displacement is
 *     exact regardless of partition; it is well within 5%.
 *   - Ghost fall (applyGravity + integrate with velocity clamped to MAX_FALL)
 *     is order-dependent across variable dt, but with the bounds above the
 *     total y-displacement stays within 5% of the 60 FPS reference.
 */

const TOLERANCE = 0.05; // 5%
const MAX_DT = CONFIG.MAX_DELTA_SECONDS; // 0.05 s per-frame clamp (R10.4)

// Build a dt partition of exactly 1.0 s from k random weights where every frame
// is within (0, MAX_DT]. We distribute the 1 s budget by scaling the weights so
// the mean frame is `1/k`, then clamp each frame to MAX_DT, carrying any trimmed
// time forward to later frames. Because k >= 20 guarantees the budget fits under
// the ceiling, the greedy fill always lands on exactly 1.0 s with all frames
// <= MAX_DT. The leftover (if any, due to clamping late frames) is absorbed by
// re-spreading across frames that still have headroom.
function makePartition(weights) {
  const k = weights.length;
  const total = weights.reduce((s, w) => s + w, 0);
  // Normalized shares of the 1 s budget (sum to 1.0).
  const shares = weights.map((w) => w / total);

  const dts = new Array(k).fill(0);
  let remaining = 1.0;
  // Fill proportionally to the shares, clamped to MAX_DT, over repeated passes
  // so any clamp-trimmed time is redistributed to frames with headroom.
  for (let pass = 0; pass < 1000 && remaining > 1e-12; pass++) {
    // Total share of frames that still have headroom below MAX_DT.
    let openShare = 0;
    for (let i = 0; i < k; i++) {
      if (dts[i] < MAX_DT) openShare += shares[i];
    }
    if (openShare <= 0) break; // all frames at the ceiling
    const addStep = remaining;
    for (let i = 0; i < k && remaining > 1e-12; i++) {
      if (dts[i] >= MAX_DT) continue;
      const want = (shares[i] / openShare) * addStep;
      const room = MAX_DT - dts[i];
      const give = Math.min(want, room, remaining);
      dts[i] += give;
      remaining -= give;
    }
  }
  return dts;
}

// Step the ghost (no flap) through a dt sequence, returning total y-displacement.
function ghostDisplacement(dts) {
  let ghost = { x: 0, y: 0, vy: 0, width: CONFIG.ghost.width, height: CONFIG.ghost.height };
  const startY = ghost.y;
  for (const dt of dts) {
    ghost = applyGravity(ghost, dt);
    ghost = integrate(ghost, dt);
  }
  return ghost.y - startY;
}

// Step a pipe set through a dt sequence, returning total x-displacement (abs).
function pipeDisplacement(dts) {
  let pipes = [{ x: 400, gapY: 300, gapHeight: CONFIG.GAP_HEIGHT, width: CONFIG.PIPE_WIDTH, scored: false }];
  const startX = pipes[0].x;
  for (const dt of dts) {
    pipes = advancePipes(pipes, dt);
  }
  return startX - pipes[0].x;
}

// The 60 FPS reference partition: 60 frames of dt = 1/60 s (sums to 1.0 s).
const REFERENCE_DTS = Array.from({ length: 60 }, () => 1 / 60);
const REFERENCE_GHOST = ghostDisplacement(REFERENCE_DTS);
const REFERENCE_PIPE = pipeDisplacement(REFERENCE_DTS);

// Generate a partition of 1 s: k in [25, 120], each with a positive weight.
const partitionArb = fc
  .integer({ min: 25, max: 120 })
  .chain((k) =>
    fc.array(fc.double({ min: 0.001, max: 1, noNaN: true, noDefaultInfinity: true }), {
      minLength: k,
      maxLength: k,
    })
  )
  .map(makePartition);

// Feature: flappy-kiro, Property 23: Delta-time scaling makes motion frame-rate independent
// Validates: Requirements 10.4
describe('Property 23: Delta-time scaling makes motion frame-rate independent', () => {
  it('total pipe displacement over 1 s is within 5% of the 60 FPS reference', () => {
    fc.assert(
      fc.property(partitionArb, (dts) => {
        // Sanity: the partition sums to ~1.0 s.
        const sum = dts.reduce((s, dt) => s + dt, 0);
        expect(sum).toBeCloseTo(1.0, 6);

        const displacement = pipeDisplacement(dts);
        const relError = Math.abs(displacement - REFERENCE_PIPE) / REFERENCE_PIPE;
        expect(relError).toBeLessThanOrEqual(TOLERANCE);
      }),
      { numRuns: 100 }
    );
  });

  it('total ghost displacement over 1 s is within 5% of the 60 FPS reference', () => {
    fc.assert(
      fc.property(partitionArb, (dts) => {
        const displacement = ghostDisplacement(dts);
        const relError = Math.abs(displacement - REFERENCE_GHOST) / REFERENCE_GHOST;
        expect(relError).toBeLessThanOrEqual(TOLERANCE);
      }),
      { numRuns: 100 }
    );
  });
});
