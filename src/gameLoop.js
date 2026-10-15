/**
 * gameLoop.js — Flappy Kiro delta-time game loop (side-effecting heartbeat).
 *
 * `createGameLoop(deps)` builds the single `requestAnimationFrame`-driven loop
 * that is the game's heartbeat (design.md "Game Loop"). Each tick it:
 *
 *   1. Computes `deltaSeconds = (now - lastTimestamp) / 1000`, clamped to
 *      `CONFIG.MAX_DELTA_SECONDS` so a background-tab pause or a long stall
 *      cannot teleport the physics on the first frame back (R10.4). On the very
 *      first tick there is no previous timestamp, so the delta is treated as 0
 *      (no simulation advance that frame) and only the timestamp is seeded.
 *   2. Drains at most one queued Flap_Input for this frame and routes it to the
 *      state manager, so a burst of inputs applies a single impulse (R2.5).
 *   3. Calls `game.update(deltaSeconds)` to advance the active state.
 *   4. Calls `renderer.render(game.getSnapshot())` to draw the frame.
 *   5. Stores `now` as the last timestamp and requests the next frame, unless
 *      the loop has been stopped.
 *
 * Because every positional update multiplies a per-second rate by
 * `deltaSeconds`, on-screen travel per wall-clock second stays constant across
 * frame rates (R10.2, R10.4).
 *
 * All collaborators and the clock/scheduler arrive through `deps`, so a test
 * can inject a manual frame driver and a fake clock to step the loop
 * deterministically. The real clock (`performance.now`) and scheduler
 * (`requestAnimationFrame`) are only reached for their production defaults.
 *
 * _Requirements: 2.5, 10.2, 10.4_
 */

import { CONFIG } from './config.js';

/**
 * Resolve the default frame scheduler.
 *
 * Prefers the global `requestAnimationFrame`. When it is unavailable (e.g. a
 * non-browser host used only to smoke-test the module), fall back to a
 * ~60 FPS `setTimeout` shim so the loop still runs. If neither exists, throw —
 * but tests always inject `requestFrame`, so this never fires under test.
 *
 * @returns {(callback: (timestamp: number) => void) => (number|object)}
 */
function resolveDefaultRequestFrame() {
  if (typeof requestAnimationFrame === 'function') {
    return (callback) => requestAnimationFrame(callback);
  }
  if (typeof setTimeout === 'function') {
    // ~16.67 ms ≈ 60 FPS. The timestamp handed to the callback mirrors rAF's
    // high-resolution time so delta computation stays consistent.
    const nowFn =
      typeof performance !== 'undefined' && typeof performance.now === 'function'
        ? () => performance.now()
        : () => Date.now();
    return (callback) => setTimeout(() => callback(nowFn()), 1000 / 60);
  }
  throw new Error(
    'gameLoop: no frame scheduler available (requestAnimationFrame/setTimeout missing)',
  );
}

/**
 * Resolve the default monotonic-ish clock in milliseconds.
 *
 * @returns {() => number}
 */
function resolveDefaultNow() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return () => performance.now();
  }
  return () => Date.now();
}

/**
 * Create the delta-time game loop.
 *
 * @param {object} deps
 * @param {{
 *   update: (deltaSeconds: number) => void,
 *   handleFlap: () => void,
 *   getSnapshot: () => object
 * }} deps.game The state manager driving the simulation each frame.
 * @param {{ consumeOneFlap: () => boolean }} deps.input The input handler. Its
 *   `consumeOneFlap()` returns `true` at most once per queued flap (R2.5).
 * @param {{ render: (snapshot: object) => void }} deps.renderer The renderer
 *   that draws a snapshot. (A bare render callback also works: pass
 *   `{ render: fn }`.)
 * @param {(callback: (timestamp: number) => void) => (number|object)} [deps.requestFrame]
 *   Schedules the next frame and returns a handle. Defaults to
 *   `requestAnimationFrame` (with a `setTimeout` fallback). Inject a manual
 *   driver in tests.
 * @param {() => number} [deps.now] Monotonic-ish clock in milliseconds.
 *   Defaults to `performance.now()` (falling back to `Date.now()`).
 * @returns {{ start: () => void, stop: () => void, isRunning: () => boolean }}
 *   The loop controls. `start()` begins scheduling frames (idempotent while
 *   running); `stop()` halts further scheduling; `isRunning()` reports state.
 */
export function createGameLoop(deps = {}) {
  const {
    game,
    input,
    renderer,
    requestFrame = resolveDefaultRequestFrame(),
    now = resolveDefaultNow(),
  } = deps;

  if (!game || typeof game.update !== 'function' ||
      typeof game.handleFlap !== 'function' ||
      typeof game.getSnapshot !== 'function') {
    throw new Error('gameLoop: deps.game must provide update, handleFlap, getSnapshot');
  }
  if (!input || typeof input.consumeOneFlap !== 'function') {
    throw new Error('gameLoop: deps.input must provide consumeOneFlap');
  }
  if (!renderer || typeof renderer.render !== 'function') {
    throw new Error('gameLoop: deps.renderer must provide render');
  }

  /** Whether the loop is actively scheduling frames. */
  let running = false;
  /** Timestamp (ms) of the previous tick, or null before the first tick. */
  let lastTimestamp = null;

  /**
   * Advance the simulation by one frame and schedule the next.
   *
   * The timestamp comes from the scheduler when it supplies one (rAF passes a
   * high-resolution time); otherwise we read the clock ourselves so an injected
   * driver that calls `tick()` with no argument still works.
   *
   * @param {number} [timestamp] High-resolution time in ms from the scheduler.
   * @returns {void}
   */
  function tick(timestamp) {
    if (!running) {
      // A stop() between schedule and callback cancels this frame's work.
      return;
    }

    const current = typeof timestamp === 'number' ? timestamp : now();

    // Step 1: delta time, clamped. First tick has no prior timestamp, so the
    // delta is 0 — seed the timestamp and skip simulating a bogus huge frame.
    let deltaSeconds;
    if (lastTimestamp === null) {
      deltaSeconds = 0;
    } else {
      const rawDelta = (current - lastTimestamp) / 1000;
      // Guard against clock skew producing a negative delta.
      const safeDelta = rawDelta > 0 ? rawDelta : 0;
      deltaSeconds = Math.min(safeDelta, CONFIG.MAX_DELTA_SECONDS);
    }

    // Step 2: drain at most one queued flap and route it (R2.5).
    if (input.consumeOneFlap()) {
      game.handleFlap();
    }

    // Step 3: advance the active state by this frame's delta.
    game.update(deltaSeconds);

    // Step 4: draw the current scene from the immutable snapshot.
    renderer.render(game.getSnapshot());

    // Step 5: record the timestamp and request the next frame unless stopped.
    lastTimestamp = current;
    if (running) {
      requestFrame(tick);
    }
  }

  /**
   * Start the loop. Idempotent: calling it while already running is a no-op.
   * Resets the delta baseline so the first frame after a (re)start is treated
   * as a fresh zero-delta frame.
   *
   * @returns {void}
   */
  function start() {
    if (running) {
      return;
    }
    running = true;
    lastTimestamp = null;
    requestFrame(tick);
  }

  /**
   * Stop the loop. No further frames are scheduled; any in-flight callback
   * sees `running === false` and does nothing.
   *
   * @returns {void}
   */
  function stop() {
    running = false;
  }

  /**
   * @returns {boolean} Whether the loop is currently scheduling frames.
   */
  function isRunning() {
    return running;
  }

  return { start, stop, isRunning };
}

export default createGameLoop;
