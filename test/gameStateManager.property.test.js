import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createGame } from '../src/gameStateManager.js';
import { CONFIG } from '../src/config.js';

// Deterministic, side-effect-free dependencies so the FSM is fully testable:
// a silent audio manager, a storage stub with no persistence, a fixed rng,
// and a frozen clock.
function makeDeps() {
  return {
    audio: { playFlap() {}, playGameOver() {} },
    storage: { readHighScore: () => 0, writeHighScore() {} },
    rng: () => 0.5,
    now: () => 0,
  };
}

// A sequence of non-negative delta-time values (seconds), each within the
// config frame-delta range. At least one dt so update() is actually exercised.
const dtSequenceArb = fc.array(
  fc.double({ min: 0, max: 0.05, noNaN: true }),
  { minLength: 1, maxLength: 50 },
);

// Feature: flappy-kiro, Property 7: Ready state holds the Ghost still
describe('Property 7: Ready state holds the Ghost still', () => {
  it('keeps the Ghost at its fixed starting position with vy=0 and no gravity across any dt sequence', () => {
    fc.assert(
      fc.property(dtSequenceArb, (dtSequence) => {
        const game = createGame(makeDeps());

        // Stay in Ready: never call handleFlap().
        expect(game.state).toBe('ready');

        const initial = game.getSnapshot().ghost;
        const startX = initial.x;
        const startY = initial.y;

        // Ready holds the Ghost at vy = 0 (R3.5).
        expect(initial.vy).toBe(0);

        for (const dt of dtSequence) {
          game.update(dt);

          const ghost = game.getSnapshot().ghost;
          // Position never changes: no gravity, no integration in Ready.
          expect(ghost.x).toBe(startX);
          expect(ghost.y).toBe(startY);
          // Velocity stays pinned at 0 (no gravity acceleration applied).
          expect(ghost.vy).toBe(0);
          // The game remains in the Ready_State throughout.
          expect(game.state).toBe('ready');
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: flappy-kiro, Property 13: No collision transitions outside the Playing_State
describe('Property 13: No collision transitions outside the Playing_State', () => {
  it('never transitions out of Ready across any dt sequence (collisions are not evaluated outside Playing)', () => {
    fc.assert(
      fc.property(dtSequenceArb, (dtSequence) => {
        const game = createGame(makeDeps());

        // Ready holds the Ghost still, so no gravity/collision ever runs
        // regardless of the (arbitrary) delta-time geometry we feed it (R5.4).
        expect(game.state).toBe('ready');

        for (const dt of dtSequence) {
          game.update(dt);
          // No collision transition occurs: the phase stays Ready and never
          // becomes Game_Over.
          expect(game.state).toBe('ready');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('never re-transitions once in Game_Over across any dt sequence (collisions are not re-evaluated outside Playing)', () => {
    fc.assert(
      fc.property(dtSequenceArb, (dtSequence) => {
        const game = createGame(makeDeps());

        // Drive the game into Game_Over: flap to start Playing, then advance
        // with the max frame delta until a collision ends the game. In Playing,
        // gravity pulls the Ghost down into the ground, so this terminates.
        game.handleFlap();
        expect(game.state).toBe('playing');

        for (let i = 0; i < 10000 && game.state === 'playing'; i += 1) {
          game.update(0.05);
        }
        expect(game.state).toBe('gameOver');

        // Now feed arbitrary dt geometry. Game_Over freezes the world and does
        // not re-evaluate collisions, so no further state transition occurs
        // (R5.4). The phase stays Game_Over throughout.
        for (const dt of dtSequence) {
          game.update(dt);
          expect(game.state).toBe('gameOver');
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: flappy-kiro, Property 16: Game_Over freezes the Ghost and Pipes
describe('Property 16: Game_Over freezes the Ghost and Pipes', () => {
  it('leaves the Ghost position/velocity and every Pipe x unchanged across any dt sequence in Game_Over', () => {
    fc.assert(
      fc.property(dtSequenceArb, (dtSequence) => {
        const game = createGame(makeDeps());

        // Drive the game into Game_Over: flap to start Playing, then advance
        // with the max frame delta until a collision ends the game. Gravity
        // pulls the Ghost into the ground, so this terminates.
        game.handleFlap();
        expect(game.state).toBe('playing');

        for (let i = 0; i < 10000 && game.state === 'playing'; i += 1) {
          game.update(0.05);
        }
        expect(game.state).toBe('gameOver');

        // Capture the frozen baseline the instant Game_Over begins.
        const frozen = game.getSnapshot();
        const ghost0 = { x: frozen.ghost.x, y: frozen.ghost.y, vy: frozen.ghost.vy };
        const pipeXs0 = frozen.pipes.map((p) => p.x);

        // Feed arbitrary dt geometry. Game_Over freezes the Ghost and Pipes
        // (R8.2): no gravity, no scrolling. Clouds may still advance — we only
        // assert the Ghost and Pipes stay put.
        for (const dt of dtSequence) {
          game.update(dt);

          const snap = game.getSnapshot();
          // Ghost vertical position and velocity (and x) are untouched.
          expect(snap.ghost.x).toBe(ghost0.x);
          expect(snap.ghost.y).toBe(ghost0.y);
          expect(snap.ghost.vy).toBe(ghost0.vy);

          // Pipe count is unchanged and every Pipe's x is frozen (match by index).
          expect(snap.pipes.length).toBe(pipeXs0.length);
          snap.pipes.forEach((pipe, i) => {
            expect(pipe.x).toBe(pipeXs0[i]);
          });

          // The phase stays Game_Over throughout.
          expect(snap.phase).toBe('gameOver');
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: flappy-kiro, Property 17: Game_Over input-ignore window gates restart
describe('Property 17: Game_Over input-ignore window gates restart', () => {
  // Build deps around a mutable clock so we can control elapsed time since
  // entering Game_Over. The FSM records gameOverEnteredAt = now() at the moment
  // of the transition, and gates the restart flap on now() - enteredAt against
  // CONFIG.GAME_OVER_IGNORE_MS (R8.4). We must NOT reuse makeDeps's fixed
  // now = () => 0 — the window test needs the clock to move.
  function makeClockDeps(clock) {
    return {
      audio: { playFlap() {}, playGameOver() {} },
      storage: { readHighScore: () => 0, writeHighScore() {} },
      rng: () => 0.5,
      now: () => clock.ms,
    };
  }

  // Drive a freshly-created game into Game_Over and return the recorded
  // entry timestamp (clock.ms at the instant of the transition).
  function driveToGameOver(game, clock) {
    game.handleFlap();
    expect(game.state).toBe('playing');

    for (let i = 0; i < 10000 && game.state === 'playing'; i += 1) {
      game.update(0.05);
    }
    expect(game.state).toBe('gameOver');

    return game.getSnapshot().gameOverEnteredAt;
  }

  it('ignores a flap within the 500 ms window and accepts one at/after it', () => {
    fc.assert(
      fc.property(
        // Elapsed ms since entering Game_Over, straddling the 500 ms boundary.
        fc.integer({ min: 0, max: 2000 }),
        (elapsed) => {
          const clock = { ms: 0 };
          const game = createGame(makeClockDeps(clock));

          const enteredAt = driveToGameOver(game, clock);
          expect(enteredAt).toBe(0);

          // Advance the clock to `elapsed` ms past entering Game_Over, then flap.
          clock.ms = enteredAt + elapsed;
          game.handleFlap();

          if (elapsed < CONFIG.GAME_OVER_IGNORE_MS) {
            // Inside the ignore window: the flap is discarded, no transition.
            expect(game.state).toBe('gameOver');
          } else {
            // At or after the window: the flap triggers the restart to Ready.
            expect(game.state).toBe('ready');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: flappy-kiro, Property 18: Restart resets the world and returns to Ready
describe('Property 18: Restart resets the world and returns to Ready', () => {
  // A mutable clock lets us step past the 500 ms ignore window so the restart
  // flap is actually accepted (R8.5). We deliberately avoid makeDeps's fixed
  // now = () => 0 — the restart gate needs the clock to move.
  function makeClockDeps(clock) {
    return {
      audio: { playFlap() {}, playGameOver() {} },
      storage: { readHighScore: () => 0, writeHighScore() {} },
      rng: () => 0.5,
      now: () => clock.ms,
    };
  }

  // The Ghost's fixed starting position: horizontally centered, vertically
  // centered, at rest (R1.2, R3.5). This is the exact reset target (R8.5).
  const startX = CONFIG.playArea.width / 2;
  const startY = CONFIG.playArea.height / 2;

  it('resets score to 0, the Ghost to start, clears all pipes, and returns to Ready after the ignore window', () => {
    fc.assert(
      fc.property(
        // An action script that varies the reached Game_Over state: each `true`
        // is a flap, each `false` is a frame of play. Varying flaps/frames
        // yields varied scores, ghost positions, and pipe layouts.
        fc.array(fc.boolean(), { minLength: 0, maxLength: 60 }),
        // Elapsed ms past the ignore window (>= 500) so the restart is accepted.
        fc.integer({ min: 0, max: 2000 }),
        (actions, extraMs) => {
          const clock = { ms: 0 };
          const game = createGame(makeClockDeps(clock));

          // Capture the fresh-game start snapshot to compare the reset against.
          const fresh = game.getSnapshot().ghost;
          expect(fresh.x).toBe(startX);
          expect(fresh.y).toBe(startY);
          expect(fresh.vy).toBe(0);

          // Start Playing, then run the generated action script. Interleaving
          // flaps and frames makes score, ghost position, and pipe layout vary
          // across runs so the reset is exercised from many Game_Over states.
          game.handleFlap();
          expect(game.state).toBe('playing');
          for (const flap of actions) {
            if (game.state !== 'playing') break;
            if (flap) {
              game.handleFlap();
            } else {
              game.update(0.05);
            }
          }

          // Force death: gravity pulls the Ghost into the ground, so advancing
          // with the max frame delta always terminates in Game_Over.
          for (let i = 0; i < 10000 && game.state === 'playing'; i += 1) {
            game.update(0.05);
          }
          expect(game.state).toBe('gameOver');

          // Step the clock at/after the 500 ms ignore window, then restart.
          const enteredAt = game.getSnapshot().gameOverEnteredAt;
          clock.ms = enteredAt + CONFIG.GAME_OVER_IGNORE_MS + extraMs;
          game.handleFlap();

          // The restart flap resets the world and returns to Ready (R8.5):
          // phase is Ready, score is 0, the Ghost is back at its start
          // position with vy = 0, and no pipes remain.
          const snap = game.getSnapshot();
          expect(snap.phase).toBe('ready');
          expect(game.state).toBe('ready');
          expect(snap.score).toBe(0);
          expect(snap.ghost.x).toBe(startX);
          expect(snap.ghost.y).toBe(startY);
          expect(snap.ghost.vy).toBe(0);
          expect(snap.pipes.length).toBe(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
