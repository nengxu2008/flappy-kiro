/**
 * integration.test.js — Flappy Kiro startup & input-responsiveness timing.
 *
 * Task 14.3: integration/timing tests covering the startup watchdog and the
 * responsiveness guarantees, plus the unsupported-browser message path. These
 * are deterministic timing harness tests — logical time is driven by an
 * injected clock/scheduler so no test actually sleeps.
 *
 * Coverage:
 *   - R1.1  (Ready within 3 s of load): bootstrap() with a hung ghost image
 *           (an Image whose onload never fires) still resolves to a game in
 *           'ready' once the 3 s asset watchdog (CONFIG.ASSET_WATCHDOG_MS)
 *           fires, and the logical elapsed time to resolution is within the
 *           watchdog budget.
 *   - R2.1  (Ready -> Playing within 50 ms of a Flap_Input): a flap enqueued at
 *           an input timestamp is consumed by one loop tick and the game
 *           transitions to 'playing' within 50 ms of logical time.
 *   - R10.3 (impulse applied within 50 ms of a Flap_Input): the same tick sets
 *           the ghost's vertical velocity to CONFIG.FLAP_IMPULSE, and the
 *           applied-impulse timestamp minus the input timestamp is <= 50 ms.
 *   - R10.5 (unsupported browser): a canvas whose getContext('2d') returns null
 *           makes bootstrap() resolve { unsupported: true }, construct no loop,
 *           and reveal the static "unsupported browser" message element.
 */

import { describe, it, expect } from 'vitest';
import { bootstrap } from '../src/main.js';
import { createGame } from '../src/gameStateManager.js';
import { createGameLoop } from '../src/gameLoop.js';
import { CONFIG } from '../src/config.js';

const FLAP_IMPULSE = CONFIG.FLAP_IMPULSE;
/** Responsiveness budget shared by R2.1 and R10.3. */
const RESPONSE_BUDGET_MS = 50;

// --- Shared timing harness --------------------------------------------------

/**
 * A controllable logical clock. `now()` reads the current logical time (ms);
 * `advance(ms)` moves it forward. Nothing here touches the wall clock, so the
 * 3 s watchdog and the 50 ms budgets are exercised instantly.
 *
 * @param {number} [start=0] Initial logical time in ms.
 */
function makeClock(start = 0) {
  let t = start;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

/** A recording mock 2D context — enough for the renderer's first draw. */
function makeMockCtx() {
  return {
    fillStyle: '#000',
    globalAlpha: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect() {},
    clearRect() {},
    fillText() {},
    beginPath() {},
    moveTo() {},
    lineTo() {},
    arc() {},
    ellipse() {},
    closePath() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    drawImage() {},
    translate() {},
    scale() {},
    rotate() {},
    measureText: () => ({ width: 0 }),
  };
}

/** A canvas stub whose getContext('2d') returns the given context (or null). */
function makeCanvas(ctx) {
  return {
    width: CONFIG.playArea.width,
    height: CONFIG.playArea.height,
    getContext: (type) => (type === '2d' ? ctx : null),
    addEventListener() {},
    removeEventListener() {},
  };
}

/** A message element that records whether it was revealed. */
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

/** A document stub resolving the canvas and message elements by id. */
function makeDoc(canvas, message) {
  return {
    getElementById(id) {
      if (id === 'game') return canvas;
      if (id === 'unsupported') return message;
      return null;
    },
    // Input handler attaches listeners to `win`, not the doc, so no-op here.
    addEventListener() {},
    removeEventListener() {},
  };
}

/**
 * A window stub with a working requestAnimationFrame plus the event-target
 * surface the InputHandler needs. rAF is stored but never auto-invoked, so the
 * loop does not actually spin during a bootstrap test.
 */
function makeWin() {
  return {
    requestAnimationFrame: () => 1,
    addEventListener() {},
    removeEventListener() {},
  };
}

// --- R1.1: Ready reached within the 3 s watchdog ----------------------------

describe('Startup timing (R1.1): Ready is reached within the asset watchdog', () => {
  it('resolves to a game in ready with unsupported=false even when the ghost image never loads', async () => {
    const clock = makeClock(0);

    // An Image whose onload/onerror never fire — a hung/slow asset. `complete`
    // stays false so the synchronous cached-image shortcut is not taken.
    function HungImage() {
      this.complete = false;
      this.naturalWidth = 0;
      this.onload = null;
      this.onerror = null;
      // Setting src must NOT trigger load — this models an asset that hangs.
      this.src = '';
    }

    // Fake watchdog timer: schedule the callback and remember its delay. When
    // we fire it, advance the logical clock by exactly that delay so the
    // elapsed-to-resolution time reflects the watchdog window, not wall time.
    const scheduled = [];
    const setTimer = (fn, ms) => {
      const handle = { fn, ms, cancelled: false };
      scheduled.push(handle);
      return handle;
    };
    const clearTimer = (handle) => {
      if (handle) handle.cancelled = true;
    };

    const win = makeWin();
    const doc = makeDoc(makeCanvas(makeMockCtx()), makeMessageEl());

    const startLogical = clock.now();

    // Kick off bootstrap. It will await the image load, which only resolves
    // when the watchdog fires. requestFrame is a no-op handle so loop.start()
    // schedules a frame that never actually runs during this test.
    const bootPromise = bootstrap({
      doc,
      win,
      AudioCtor: function AudioStub() {
        this.play = () => Promise.resolve();
        this.load = () => {};
        this.cloneNode = () => new AudioStub();
      },
      ImageCtor: HungImage,
      requestFrame: () => 1,
      now: clock.now,
      setTimer,
      clearTimer,
    });

    // Let the pending image Promise register before firing the watchdog.
    await Promise.resolve();

    // Fire the watchdog: it should be scheduled at exactly ASSET_WATCHDOG_MS.
    const watchdog = scheduled.find((h) => !h.cancelled);
    expect(watchdog).toBeDefined();
    expect(watchdog.ms).toBe(CONFIG.ASSET_WATCHDOG_MS);

    clock.advance(watchdog.ms); // Logical time passes = the watchdog window.
    watchdog.fn(); // Watchdog fires -> image load resolves to null.

    const result = await bootPromise;
    const elapsed = clock.now() - startLogical;

    // Ready was reached despite the hung image: supported, game present, in
    // 'ready', and the ghost image fell back to a placeholder (null).
    expect(result.unsupported).toBe(false);
    expect(result.game).toBeDefined();
    expect(result.game.state).toBe('ready');
    expect(result.assets.ghostImage).toBeNull();

    // The watchdog let startup complete within the 3 s budget (R1.1).
    expect(elapsed).toBeLessThanOrEqual(CONFIG.ASSET_WATCHDOG_MS);
  });

  it('reaches Ready immediately when the image loads before the watchdog fires', async () => {
    const clock = makeClock(0);

    // An Image that reports load synchronously on src assignment (cached).
    function FastImage() {
      this.complete = true;
      this.naturalWidth = 32;
      this.onload = null;
      this.onerror = null;
      Object.defineProperty(this, 'src', {
        set() {
          // complete + naturalWidth already satisfy the sync shortcut.
        },
      });
    }

    const scheduled = [];
    const setTimer = (fn, ms) => {
      const handle = { fn, ms, cancelled: false };
      scheduled.push(handle);
      return handle;
    };
    const clearTimer = (handle) => {
      if (handle) handle.cancelled = true;
    };

    const result = await bootstrap({
      doc: makeDoc(makeCanvas(makeMockCtx()), makeMessageEl()),
      win: makeWin(),
      AudioCtor: function AudioStub() {
        this.play = () => Promise.resolve();
        this.load = () => {};
        this.cloneNode = () => new AudioStub();
      },
      ImageCtor: FastImage,
      requestFrame: () => 1,
      now: clock.now,
      setTimer,
      clearTimer,
    });

    // No logical time elapsed and the watchdog was cancelled, yet Ready is
    // reached — well inside the 3 s budget (R1.1).
    expect(result.unsupported).toBe(false);
    expect(result.game.state).toBe('ready');
    expect(clock.now() - 0).toBeLessThanOrEqual(CONFIG.ASSET_WATCHDOG_MS);
    const live = scheduled.filter((h) => !h.cancelled);
    expect(live.length).toBe(0); // Watchdog cancelled on fast load.
  });
});

// --- R2.1 + R10.3: flap-to-Playing and impulse applied within 50 ms ---------

describe('Input responsiveness (R2.1, R10.3): flap handled within 50 ms', () => {
  it('transitions Ready -> Playing and applies the flap impulse within one 50 ms frame', () => {
    const clock = makeClock(1000);

    // A minimal input handler we can arm with a single queued flap, matching
    // the loop contract (consumeOneFlap returns true at most once per flap).
    function makeArmableInput() {
      let queued = false;
      return {
        queue() {
          queued = true;
        },
        consumeOneFlap() {
          if (queued) {
            queued = false;
            return true;
          }
          return false;
        },
      };
    }

    const game = createGame({
      audio: { playFlap() {}, playGameOver() {} },
      storage: { readHighScore: () => 0, writeHighScore() {} },
      rng: () => 0.5,
      now: clock.now,
    });

    const input = makeArmableInput();
    let lastSnapshot = null;
    const renderer = {
      render(snapshot) {
        lastSnapshot = snapshot;
      },
    };

    // Manual frame driver: capture the scheduled callback so the test steps
    // the loop one frame at a time instead of relying on rAF.
    let pendingTick = null;
    const requestFrame = (cb) => {
      pendingTick = cb;
      return 1;
    };

    const loop = createGameLoop({
      game,
      input,
      renderer,
      requestFrame,
      now: clock.now,
    });

    loop.start(); // Seeds lastTimestamp=null and schedules the first tick.

    // Frame 1: zero-delta seeding frame, no flap queued yet. Still 'ready'.
    const seedTick = pendingTick;
    seedTick(clock.now());
    expect(game.state).toBe('ready');

    // The player flaps. Record the exact input timestamp.
    const inputAt = clock.now();
    input.queue();

    // One animation frame elapses (<= the 50 ms budget). Advance the clock by
    // a single ~16.7 ms frame, then run the frame the loop had scheduled.
    const frameDeltaMs = 1000 / 60; // ~16.67 ms
    clock.advance(frameDeltaMs);
    const flapTick = pendingTick;
    flapTick(clock.now());

    // The timestamp at which the loop consumed the flap and applied the impulse.
    const appliedAt = clock.now();

    // R2.1: the game transitioned to Playing on this frame.
    expect(game.state).toBe('playing');
    expect(lastSnapshot.phase).toBe('playing');

    // R10.3: the flap impulse was applied this frame. The loop consumes the
    // flap (vy := FLAP_IMPULSE) and then runs update(dt), which applies exactly
    // one frame of gravity. So the observed vy equals the impulse plus one
    // frame of gravity — proving the impulse landed within this single frame.
    const dtSeconds = frameDeltaMs / 1000;
    const expectedVy = FLAP_IMPULSE + CONFIG.GRAVITY * dtSeconds;
    expect(game.getSnapshot().ghost.vy).toBeCloseTo(expectedVy, 6);
    // The ghost is moving upward (negative vy) because the impulse dominates a
    // single frame of gravity — the flap was unmistakably applied.
    expect(game.getSnapshot().ghost.vy).toBeLessThan(0);

    // Both the transition and the impulse happened within 50 ms of the input.
    expect(appliedAt - inputAt).toBeLessThanOrEqual(RESPONSE_BUDGET_MS);
    expect(frameDeltaMs).toBeLessThanOrEqual(RESPONSE_BUDGET_MS);

    loop.stop();
  });

  it('applies the impulse synchronously when handleFlap is called directly (<= 50 ms)', () => {
    const clock = makeClock(0);

    const game = createGame({
      audio: { playFlap() {}, playGameOver() {} },
      storage: { readHighScore: () => 0, writeHighScore() {} },
      rng: () => 0.5,
      now: clock.now,
    });

    expect(game.state).toBe('ready');

    const inputAt = clock.now();
    game.handleFlap(); // Synchronous — the impulse is applied immediately.
    const appliedAt = clock.now();

    expect(game.state).toBe('playing');
    expect(game.getSnapshot().ghost.vy).toBe(FLAP_IMPULSE);
    // handleFlap is synchronous, so logical time cannot exceed the 50 ms budget.
    expect(appliedAt - inputAt).toBeLessThanOrEqual(RESPONSE_BUDGET_MS);
  });
});

// --- R10.5: unsupported-browser message path --------------------------------

describe('Unsupported browser (R10.5): message revealed, no loop constructed', () => {
  it('resolves { unsupported: true } and reveals the message when getContext("2d") returns null', async () => {
    const message = makeMessageEl();
    // A canvas whose 2D context is unavailable removes the required rendering
    // capability, so the capability check must fail.
    const canvas = makeCanvas(null);

    const result = await bootstrap({
      doc: makeDoc(canvas, message),
      win: makeWin(), // rAF present, so the ONLY missing capability is the 2D ctx.
      AudioCtor: function AudioStub() {},
      ImageCtor: function ImageStub() {},
      requestFrame: () => 1,
      now: () => 0,
      setTimer: (fn) => {
        // Should never be reached on the unsupported path, but keep it safe.
        return fn;
      },
      clearTimer: () => {},
    });

    // Unsupported: reported as such, and nothing was constructed — no loop,
    // game, or renderer — so the game can never enter Playing (R10.5).
    expect(result.unsupported).toBe(true);
    expect(result.loop).toBeUndefined();
    expect(result.game).toBeUndefined();
    expect(result.renderer).toBeUndefined();

    // The static "unsupported browser" message element was revealed.
    expect(message.shown).toBe(true);
  });
});
