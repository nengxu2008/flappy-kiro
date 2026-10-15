/**
 * main.js — Flappy Kiro bootstrap: capability check + asset-load watchdog.
 *
 * This is the entry point that wires every module together once the page is
 * ready. It performs two guarded startup steps described in design.md
 * ("Capability Check and Bootstrap"):
 *
 *   1. Capability check (R10.5): confirm the canvas exposes a 2D context and
 *      that `requestAnimationFrame` exists. If either is missing, reveal the
 *      static "unsupported browser" message element and return WITHOUT ever
 *      constructing the game loop, so an unsupported browser can never enter
 *      the Playing_State.
 *
 *   2. Asset load behind a watchdog (R1.1, R9.11): asynchronously load the
 *      ghost image and preload the two audio clips, racing each load against a
 *      3-second (CONFIG.ASSET_WATCHDOG_MS) timeout. Whatever the outcome, the
 *      bootstrap resolves within the watchdog window so the Ready_State is
 *      reached even when an asset is slow or fails. A failed/slow image falls
 *      back to `null` (the renderer draws a placeholder, R9.11) and audio
 *      degrades to silent (the AudioManager already no-ops a missing clip).
 *
 * After a successful capability check and the asset race, it constructs the
 * AudioManager, InputHandler, GameStateManager, Renderer, and the delta-time
 * GameLoop, then starts the loop. The game begins in Ready (R1.1).
 *
 * Everything the function touches — the document, window, the frame scheduler,
 * the clock, and the `Audio`/`Image` constructors — arrives through `deps` so
 * `bootstrap()` is deterministic and testable under jsdom/node. The module
 * only auto-runs when a real `document` is present (browser), never on import
 * under node.
 *
 * _Requirements: 1.1, 9.11, 10.5_
 */

import { CONFIG } from './config.js';
import { createGame } from './gameStateManager.js';
import { createInputHandler } from './input.js';
import { createAudioManager } from './audio.js';
import { createRenderer } from './renderer.js';
import { createGameLoop } from './gameLoop.js';
import { readHighScore, writeHighScore } from './storage.js';

/** Default asset URL for the ghost sprite. */
const GHOST_IMAGE_URL = 'assets/ghosty.png';
/** Default DOM id of the canvas element. */
const DEFAULT_CANVAS_ID = 'game';
/** Default DOM id of the "unsupported browser" message element. */
const DEFAULT_MESSAGE_ID = 'unsupported';

/**
 * Reveal a hidden "unsupported browser" message element.
 *
 * Tolerant of however the page chose to hide it: clears a `hidden` attribute,
 * drops a `hidden` CSS class, and forces `display: block`. A missing element
 * is a no-op so the bootstrap never throws while reporting that it cannot run.
 *
 * @param {Element | null | undefined} el The message element, or null.
 * @returns {void}
 */
function revealMessage(el) {
  if (!el) {
    return;
  }
  try {
    if (typeof el.removeAttribute === 'function') {
      el.removeAttribute('hidden');
    }
    if (el.classList && typeof el.classList.remove === 'function') {
      el.classList.remove('hidden');
    }
    if (el.style) {
      el.style.display = 'block';
    }
  } catch {
    // Best-effort reveal; never let a DOM quirk break the unsupported path.
  }
}

/**
 * Load an image behind a watchdog, resolving to the image on success or `null`
 * on error/timeout so the renderer falls back to a placeholder (R9.11).
 *
 * Resolves (never rejects) with:
 *   - the loaded image once it reports `load`,
 *   - `null` if it reports `error`, or
 *   - `null` if the watchdog fires first (slow/hung load, R1.1).
 *
 * @param {object} opts
 * @param {new () => HTMLImageElement} opts.ImageCtor The `Image` constructor.
 * @param {string} opts.url Image source URL.
 * @param {number} opts.watchdogMs Max time to wait before falling back.
 * @param {(fn: () => void, ms: number) => any} opts.setTimer A `setTimeout`-like scheduler.
 * @param {(handle: any) => void} opts.clearTimer A `clearTimeout`-like canceller.
 * @returns {Promise<HTMLImageElement | null>}
 */
function loadImageWithWatchdog({ ImageCtor, url, watchdogMs, setTimer, clearTimer }) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;

    const finish = (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      resolve(value);
    };

    // Watchdog: reach Ready even if the image hangs (R1.1).
    timer = setTimer(() => finish(null), watchdogMs);

    if (typeof ImageCtor !== 'function') {
      finish(null);
      return;
    }

    try {
      const img = new ImageCtor();
      img.onload = () => finish(img);
      img.onerror = () => finish(null);
      img.src = url;
      // An already-cached image may report complete synchronously.
      if (img.complete && img.naturalWidth > 0) {
        finish(img);
      }
    } catch {
      finish(null);
    }
  });
}

/**
 * Bootstrap the game: capability check, watchdog-guarded asset load, then wire
 * and start the loop.
 *
 * @param {object} [deps] Injectable collaborators (default to real globals).
 * @param {Document} [deps.doc] The document used to find elements. Defaults to
 *   the global `document`.
 * @param {Window} [deps.win] The window hosting `requestAnimationFrame`.
 *   Defaults to the global `window` (falling back to `globalThis`).
 * @param {(cb: (t: number) => void) => any} [deps.requestFrame] Frame
 *   scheduler handed to the loop. Defaults to the window's
 *   `requestAnimationFrame` (bound to the window).
 * @param {() => number} [deps.now] Monotonic-ish clock in ms. Defaults to
 *   `performance.now()` (falling back to `Date.now()`).
 * @param {new (src?: string) => HTMLAudioElement} [deps.AudioCtor] The `Audio`
 *   constructor for the AudioManager. Defaults to the global `Audio`.
 * @param {new () => HTMLImageElement} [deps.ImageCtor] The `Image` constructor
 *   for ghost-sprite loading. Defaults to the global `Image`.
 * @param {string} [deps.canvasId] Id of the canvas element. Defaults to `game`.
 * @param {string} [deps.messageId] Id of the unsupported-message element.
 *   Defaults to `unsupported`.
 * @param {number} [deps.watchdogMs] Asset-load watchdog in ms. Defaults to
 *   `CONFIG.ASSET_WATCHDOG_MS` (3000).
 * @param {(fn: () => void, ms: number) => any} [deps.setTimer] `setTimeout`-like.
 * @param {(handle: any) => void} [deps.clearTimer] `clearTimeout`-like.
 * @param {string} [deps.ghostImageUrl] Ghost sprite URL. Defaults to
 *   `assets/ghosty.png`.
 * @returns {Promise<{
 *   unsupported: boolean,
 *   game?: object,
 *   input?: object,
 *   renderer?: object,
 *   loop?: object,
 *   audio?: object,
 *   assets?: { ghostImage: (HTMLImageElement|null) }
 * }>} On an unsupported browser, `{ unsupported: true }` and nothing else is
 *   constructed. Otherwise the constructed pieces for testing.
 */
export async function bootstrap(deps = {}) {
  const globalObj =
    typeof globalThis !== 'undefined' ? globalThis : /* istanbul ignore next */ {};

  const {
    doc = typeof document !== 'undefined' ? document : undefined,
    win = typeof window !== 'undefined' ? window : globalObj,
    AudioCtor = typeof Audio !== 'undefined' ? Audio : undefined,
    ImageCtor = typeof Image !== 'undefined' ? Image : undefined,
    canvasId = DEFAULT_CANVAS_ID,
    messageId = DEFAULT_MESSAGE_ID,
    watchdogMs = CONFIG.ASSET_WATCHDOG_MS,
    ghostImageUrl = GHOST_IMAGE_URL,
    setTimer = (fn, ms) => setTimeout(fn, ms),
    clearTimer = (handle) => clearTimeout(handle),
  } = deps;

  // --- Step 1: capability check (R10.5) ---------------------------------
  const canvas =
    doc && typeof doc.getElementById === 'function'
      ? doc.getElementById(canvasId)
      : null;

  let ctx = null;
  if (canvas && typeof canvas.getContext === 'function') {
    try {
      ctx = canvas.getContext('2d');
    } catch {
      ctx = null; // Some stubs throw instead of returning null.
    }
  }

  const hasRaf =
    (win && typeof win.requestAnimationFrame === 'function') ||
    typeof requestAnimationFrame === 'function';

  if (!ctx || !hasRaf) {
    // Unsupported: reveal the message, construct NOTHING, never run (R10.5).
    const message =
      doc && typeof doc.getElementById === 'function'
        ? doc.getElementById(messageId)
        : null;
    revealMessage(message);
    return { unsupported: true };
  }

  const requestFrame =
    deps.requestFrame ||
    (win && typeof win.requestAnimationFrame === 'function'
      ? (cb) => win.requestAnimationFrame(cb)
      : (cb) => requestAnimationFrame(cb));

  const now =
    deps.now ||
    (typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? () => performance.now()
      : () => Date.now());

  // --- Step 2: load assets behind a 3-second watchdog (R1.1, R9.11) -----
  // The audio clips preload eagerly inside the AudioManager; a missing/blocked
  // clip already degrades to silence, so we only need to watchdog the image.
  const audio = createAudioManager({ AudioCtor });

  const ghostImage = await loadImageWithWatchdog({
    ImageCtor,
    url: ghostImageUrl,
    watchdogMs,
    setTimer,
    clearTimer,
  });

  const assets = { ghostImage };

  // --- Step 3: construct and start (game begins in Ready, R1.1) ---------
  const input = createInputHandler(win);

  const game = createGame({
    audio,
    storage: { readHighScore, writeHighScore },
    now,
    assets,
  });

  const renderer = createRenderer(ctx);

  const loop = createGameLoop({
    game,
    input,
    renderer,
    requestFrame,
    now,
  });

  loop.start();

  return { unsupported: false, game, input, renderer, loop, audio, assets };
}

export default bootstrap;

// Auto-run only in a real browser (a present document), never on import under
// node. Guarded so importing this module for tests has no side effects.
if (typeof document !== 'undefined') {
  // Fire-and-forget; errors here would only prevent the game from starting and
  // must not become unhandled rejections.
  Promise.resolve()
    .then(() => bootstrap())
    .catch(() => {
      // Startup failure is non-recoverable here; swallow so no console noise
      // in environments that treat unhandled rejections as fatal.
    });
}
