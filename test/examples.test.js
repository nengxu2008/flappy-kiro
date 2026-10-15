import { describe, it, expect } from 'vitest';
import { createGame } from '../src/gameStateManager.js';
import { CONFIG } from '../src/config.js';

// Feature: flappy-kiro — example tests for Ready-state and spawn scenarios.
//
// These are concrete, deterministic example tests (as opposed to the
// property-based suites). They pin down the exact Ready-state start conditions,
// the first-pipe spawn geometry on entering Playing, the derived top/bottom
// segment boxes that bracket the Gap, and the Score reset at session start.
//
// Covers Requirements 1.2, 1.4, 4.3, 4.7, 6.1.

// Deterministic, side-effect-free dependencies so the FSM is fully testable:
// a silent (no-op) audio manager, a storage stub returning 0, a fixed rng, and
// a frozen clock.
function makeDeps() {
  return {
    audio: { playFlap() {}, playGameOver() {} },
    storage: { readHighScore: () => 0, writeHighScore() {} },
    rng: () => 0.5,
    now: () => 0,
  };
}

const { playArea } = CONFIG;
const startX = playArea.width / 2;
const startY = playArea.height / 2;

describe('Example: Ready-state start conditions (R1.2, R1.4)', () => {
  it('centers the Ghost horizontally and vertically at start, shows Score 0, and begins in Ready', () => {
    const game = createGame(makeDeps());

    // The game begins in the Ready_State.
    expect(game.state).toBe('ready');

    const snapshot = game.getSnapshot();

    // R1.2: the Ghost is horizontally and vertically centered within the
    // Play_Area at its fixed starting position, at rest.
    expect(snapshot.ghost.x).toBe(startX);
    expect(snapshot.ghost.y).toBe(startY);
    expect(snapshot.ghost.vy).toBe(0);

    // R1.4: the current Score reads 0 in the Ready_State.
    expect(snapshot.score).toBe(0);
  });
});

describe('Example: first pipe spawns off the right edge on entering Playing (R4.3)', () => {
  it('transitions to Playing on a flap and spawns the first Pipe off the right edge', () => {
    const game = createGame(makeDeps());

    expect(game.state).toBe('ready');

    // A flap in the Ready_State starts play (R2.1).
    game.handleFlap();
    expect(game.state).toBe('playing');

    const snapshot = game.getSnapshot();

    // Exactly one Pipe is seeded at the start of play.
    expect(snapshot.pipes.length).toBeGreaterThanOrEqual(1);
    const firstPipe = snapshot.pipes[0];

    // R4.3: the first Pipe spawns off the right edge of the Play_Area. The
    // Pipe's center is PIPE_SPACING to the right of the right edge, so even its
    // left edge (x - width/2) sits at or beyond the right edge.
    const leftEdge = firstPipe.x - firstPipe.width / 2;
    expect(firstPipe.x).toBeGreaterThanOrEqual(playArea.width);
    expect(leftEdge).toBeGreaterThanOrEqual(playArea.width);

    // Concretely, with lastPipeX = playArea.width, the spawn lands exactly
    // PIPE_SPACING further right.
    expect(firstPipe.x).toBe(playArea.width + CONFIG.PIPE_SPACING);
  });
});

describe('Example: derived segment boxes bracket the Gap (R4.7)', () => {
  it('places the top segment above the Gap and the bottom segment below, within margins', () => {
    const game = createGame(makeDeps());
    game.handleFlap();
    expect(game.state).toBe('playing');

    const firstPipe = game.getSnapshot().pipes[0];

    const halfGap = firstPipe.gapHeight / 2;
    const groundTop = playArea.height - playArea.groundHeight;

    // Derive the two solid segment boxes exactly as collision.js does:
    //   top segment:    Ceiling (y = 0) down to gapY - gapHeight/2
    //   bottom segment: gapY + gapHeight/2 down to the top of the Ground
    const topSegmentBottom = firstPipe.gapY - halfGap;
    const bottomSegmentTop = firstPipe.gapY + halfGap;

    // R4.7: the top segment descends from the Ceiling to the top edge of the
    // Gap, and the bottom segment rises from the Ground to the bottom edge of
    // the Gap — the two segments bracket the Gap.
    expect(topSegmentBottom).toBeLessThan(firstPipe.gapY);
    expect(bottomSegmentTop).toBeGreaterThan(firstPipe.gapY);
    expect(topSegmentBottom).toBeLessThan(bottomSegmentTop);

    // The Gap region (gapY ± gapHeight/2) lies strictly between the two
    // segments and the full Gap fits inside it. Use toBeCloseTo: reconstructing
    // the height from two subtractions accumulates IEEE-754 rounding (57.6 is
    // not exactly representable), so exact equality is inappropriate for floats.
    expect(bottomSegmentTop - topSegmentBottom).toBeCloseTo(firstPipe.gapHeight, 9);

    // The Gap sits within the Play_Area with at least GAP_MARGIN from both the
    // Ceiling and the Ground (R4.4), so the segments bracket it with the
    // required clearance.
    expect(topSegmentBottom).toBeGreaterThanOrEqual(CONFIG.GAP_MARGIN);
    expect(bottomSegmentTop).toBeLessThanOrEqual(groundTop - CONFIG.GAP_MARGIN);

    // The Gap height is the fixed value, at least twice the Ghost's height (R4.5).
    expect(firstPipe.gapHeight).toBe(CONFIG.GAP_HEIGHT);
    expect(firstPipe.gapHeight).toBeGreaterThanOrEqual(2 * CONFIG.ghost.height);
  });
});

describe('Example: Score resets to 0 at session start (R6.1)', () => {
  it('shows Score 0 immediately upon entering Playing', () => {
    const game = createGame(makeDeps());

    // Flap from Ready to Playing: the session Score starts at 0 (R6.1).
    game.handleFlap();
    expect(game.state).toBe('playing');
    expect(game.getSnapshot().score).toBe(0);
  });

  it('resets Score to 0 on a fresh session after a prior play/restart cycle', () => {
    // A mutable clock so we can step past the 500 ms Game_Over ignore window
    // and actually accept the restart flap (R8.4/R8.5).
    const clock = { ms: 0 };
    const game = createGame({
      audio: { playFlap() {}, playGameOver() {} },
      storage: { readHighScore: () => 0, writeHighScore() {} },
      rng: () => 0.5,
      now: () => clock.ms,
    });

    // Play a session: start, then let gravity drive the Ghost into the ground
    // so the game ends. Along the way the Score may increase above 0.
    game.handleFlap();
    expect(game.state).toBe('playing');
    for (let i = 0; i < 10000 && game.state === 'playing'; i += 1) {
      game.update(0.05);
    }
    expect(game.state).toBe('gameOver');

    // Step past the ignore window and restart back to Ready.
    const enteredAt = game.getSnapshot().gameOverEnteredAt;
    clock.ms = enteredAt + CONFIG.GAME_OVER_IGNORE_MS;
    game.handleFlap();
    expect(game.state).toBe('ready');
    expect(game.getSnapshot().score).toBe(0);

    // Start a brand-new session: the Score is reset to 0 at session start (R6.1).
    game.handleFlap();
    expect(game.state).toBe('playing');
    expect(game.getSnapshot().score).toBe(0);
  });
});
