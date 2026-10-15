import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createGame } from '../src/gameStateManager.js';
import { bootstrap } from '../src/main.js';

// Property 24 verifies the capability-check gate (R10.5): a browser that fails
// the capability check is flagged `unsupported` and can never reach the
// Playing_State, no matter how the player flaps or how time advances.
//
// Two complementary angles:
//   (1) GameStateManager level — deterministic. An unsupported game gates
//       handleFlap() so it stays in Ready across any interleaving of flaps and
//       updates, and its snapshot keeps unsupported === true.
//   (2) Bootstrap level — deterministic. A document whose canvas yields no 2D
//       context fails the capability check: bootstrap() resolves
//       { unsupported: true } and constructs nothing (no loop).

// Deterministic, side-effect-free dependencies for an unsupported game: a
// silent audio manager, a no-persistence storage stub, a fixed rng, and a
// frozen clock. The `unsupported: true` flag is what Property 24 exercises.
function makeUnsupportedDeps() {
  return {
    unsupported: true,
    audio: { playFlap() {}, playGameOver() {} },
    storage: { readHighScore: () => 0, writeHighScore() {} },
    rng: () => 0.5,
    now: () => 0,
  };
}

// An action script: each `true` is a handleFlap(), each `false` is an
// update(dt) frame. At least one action so the game is actually exercised.
// Varying the mix drives many flap/update interleavings against the gate.
const actionScriptArb = fc.array(
  fc.oneof(
    fc.constant({ flap: true }),
    fc
      .double({ min: 0, max: 0.05, noNaN: true })
      .map((dt) => ({ flap: false, dt })),
  ),
  { minLength: 1, maxLength: 100 },
);

// Feature: flappy-kiro, Property 24: Unsupported browsers never enter Playing
describe('Property 24: Unsupported browsers never enter Playing', () => {
  it('stays in Ready and flagged unsupported across any flap/update interleaving (GameStateManager level)', () => {
    fc.assert(
      fc.property(actionScriptArb, (actions) => {
        const game = createGame(makeUnsupportedDeps());

        // A fresh unsupported game begins in Ready and is flagged unsupported.
        expect(game.state).toBe('ready');
        expect(game.getSnapshot().unsupported).toBe(true);

        // Replay the script: handleFlap() is gated for an unsupported browser
        // (R10.5), so no flap starts play and updates never leave Ready.
        for (const action of actions) {
          if (action.flap) {
            game.handleFlap();
          } else {
            game.update(action.dt);
          }

          // The game can never enter Playing: it holds in Ready throughout.
          expect(game.state).toBe('ready');
          const snap = game.getSnapshot();
          expect(snap.phase).toBe('ready');
          // The unsupported flag is sticky — it stays true for the whole run.
          expect(snap.unsupported).toBe(true);
        }

        // Final state is still Ready, never Playing.
        expect(game.state).not.toBe('playing');
      }),
      { numRuns: 100 },
    );
  });

  it('resolves { unsupported: true } and constructs no loop when the canvas has no 2D context (bootstrap level)', async () => {
    // A minimal message element so revealMessage() has something to reveal; it
    // records that it was shown so we can confirm the unsupported path ran.
    function makeMessageEl() {
      return {
        shown: false,
        removeAttribute() {
          this.shown = true;
        },
        classList: { remove() {} },
        style: {},
      };
    }

    // A canvas stub whose getContext('2d') returns null simulates a browser
    // lacking the Canvas 2D rendering capability (R10.5).
    function makeUnsupportedCanvas() {
      return { getContext: () => null };
    }

    // Build a document stub resolving the canvas and message elements by id.
    function makeDoc(canvas, message) {
      return {
        getElementById(id) {
          if (id === 'game') return canvas;
          if (id === 'unsupported') return message;
          return null;
        },
      };
    }

    // A window with a working requestAnimationFrame — so the ONLY failing
    // capability is the missing 2D context, isolating that gate.
    const win = { requestAnimationFrame: () => 1 };

    // The capability outcome must not depend on timing, so this is run once
    // deterministically rather than wrapped in fc.assert.
    const message = makeMessageEl();
    const result = await bootstrap({
      doc: makeDoc(makeUnsupportedCanvas(), message),
      win,
      // Constructors are irrelevant on the unsupported path; pass harmless stubs.
      AudioCtor: function AudioStub() {},
      ImageCtor: function ImageStub() {},
      requestFrame: () => 1,
      now: () => 0,
      setTimer: (fn) => fn,
      clearTimer: () => {},
    });

    // Unsupported: the bootstrap reports it and constructs nothing — no loop,
    // no game, no renderer — so the game can never enter Playing (R10.5).
    expect(result.unsupported).toBe(true);
    expect(result.loop).toBeUndefined();
    expect(result.game).toBeUndefined();
    expect(result.renderer).toBeUndefined();
    // The static "unsupported browser" message was revealed.
    expect(message.shown).toBe(true);
  });
});
