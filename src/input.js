/**
 * input.js — Flappy Kiro InputHandler (side-effecting, DOM).
 *
 * Registers DOM listeners for the three Flap_Input sources — mouse
 * (`mousedown`/`click`), touch (`touchstart`), and keyboard (`keydown` with
 * Space) — and normalizes all of them to a single `flap` signal (R2.4).
 *
 * The handler keeps an internal "flap queued" flag rather than a counter: any
 * number of flap events arriving between two `consumeOneFlap()` calls collapse
 * to a single available flap, so the loop can only ever apply one flap per
 * frame (R2.5). `consumeOneFlap()` returns `true` at most once per queued flap
 * (clearing the flag) and `false` otherwise.
 *
 * For keyboard input only the Space bar triggers a flap, and we call
 * `preventDefault()` on it so the page does not scroll while playing.
 *
 * A `dispose()` method removes every registered listener so the handler can be
 * torn down (e.g. between tests or on teardown). The factory defaults its
 * `target` to `window`, which also works under jsdom.
 *
 * _Requirements: 2.4, 2.5_
 */

/**
 * Create an InputHandler bound to a DOM event target.
 *
 * Registers `mousedown`, `click`, `touchstart`, and `keydown` listeners on
 * `target`. Mouse, touch, and the Space key are all normalized to the same
 * flap signal; the Space key additionally has its default action prevented to
 * avoid page scrolling.
 *
 * @param {EventTarget} [target=window] The DOM target to listen on. Defaults
 *   to `window` (works under jsdom).
 * @returns {{
 *   consumeOneFlap: () => boolean,
 *   dispose: () => void,
 *   detach: () => void,
 * }} The handler. `consumeOneFlap()` returns `true` at most once per queued
 *   flap and clears the queued flag; `dispose()`/`detach()` remove all
 *   listeners.
 */
export function createInputHandler(target = window) {
  // Internal "a flap is available" flag. Multiple flap sources firing before
  // the next consumeOneFlap() collapse to this single boolean (R2.5).
  let flapQueued = false;

  /** Mark a flap as available for the next frame. */
  function queueFlap() {
    flapQueued = true;
  }

  // --- Normalized source listeners ---------------------------------------

  function onMouseDown() {
    queueFlap();
  }

  function onClick() {
    queueFlap();
  }

  function onTouchStart() {
    queueFlap();
  }

  function onKeyDown(event) {
    // Only the Space bar is a Flap_Input. Support both the modern `code`
    // ("Space") and the legacy `key` (" ") so older environments still flap.
    const isSpace =
      (event && event.code === "Space") || (event && event.key === " ");
    if (!isSpace) {
      return;
    }
    // Stop the browser from scrolling the page on Space.
    if (typeof event.preventDefault === "function") {
      event.preventDefault();
    }
    queueFlap();
  }

  target.addEventListener("mousedown", onMouseDown);
  target.addEventListener("click", onClick);
  target.addEventListener("touchstart", onTouchStart);
  target.addEventListener("keydown", onKeyDown);

  /**
   * Consume at most one queued flap for the current frame.
   *
   * Returns `true` exactly once per queued flap (clearing the flag) and
   * `false` when no flap is queued. The loop calls this once per frame so that
   * any burst of flap events applies only a single impulse (R2.5).
   *
   * @returns {boolean} Whether a flap should be applied this frame.
   */
  function consumeOneFlap() {
    if (flapQueued) {
      flapQueued = false;
      return true;
    }
    return false;
  }

  /** Remove every registered listener. */
  function dispose() {
    target.removeEventListener("mousedown", onMouseDown);
    target.removeEventListener("click", onClick);
    target.removeEventListener("touchstart", onTouchStart);
    target.removeEventListener("keydown", onKeyDown);
  }

  return {
    consumeOneFlap,
    dispose,
    // Alias so callers can use either name.
    detach: dispose,
  };
}

export default createInputHandler;
