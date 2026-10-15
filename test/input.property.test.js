import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { createInputHandler } from '../src/input.js';

/**
 * A minimal stand-in for a DOM Event used to drive the InputHandler listeners.
 *
 * It carries the `type`, plus optional `code`/`key` for keyboard events, and
 * records whether `preventDefault()` was called so Space handling can be
 * exercised without a real browser.
 */
function makeEvent(type, { code, key } = {}) {
  return {
    type,
    code,
    key,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
  };
}

/**
 * A minimal EventTarget implementation that supports the subset the
 * InputHandler uses: addEventListener / removeEventListener / dispatchEvent.
 *
 * jsdom provides a real EventTarget, but a hand-rolled stub keeps this test
 * independent of the environment and makes dispatching plain event objects
 * (with a custom `code`) trivial.
 */
function makeTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) {
      if (listeners.has(type)) listeners.get(type).delete(fn);
    },
    dispatchEvent(event) {
      const fns = listeners.get(event.type);
      if (fns) for (const fn of fns) fn(event);
      return true;
    },
  };
}

// The four equivalent flap sources (R2.4). Each entry knows how to produce the
// DOM event that the InputHandler listens for.
const SOURCES = {
  mousedown: () => makeEvent('mousedown'),
  click: () => makeEvent('click'),
  touchstart: () => makeEvent('touchstart'),
  'keydown-Space': () => makeEvent('keydown', { code: 'Space' }),
};

const sourceArb = fc.constantFrom(...Object.keys(SOURCES));

// Feature: flappy-kiro, Property 3: Flap input source equivalence
// Validates: Requirements 2.4
describe('Property 3: Flap input source equivalence', () => {
  it('normalizes mouse, touch, and keyboard flaps to an identical flap signal and state change', () => {
    fc.assert(
      fc.property(sourceArb, (sourceName) => {
        // Fresh handler + target per generated source so each run is isolated.
        const target = makeTarget();
        const handler = createInputHandler(target);

        try {
          // No input dispatched yet: no flap is available.
          expect(handler.consumeOneFlap()).toBe(false);

          // Dispatch the one event for this source.
          target.dispatchEvent(SOURCES[sourceName]());

          // Every source produces exactly one normalized flap: the first
          // consume reports it, the second does not. This result is identical
          // across all sources (R2.4).
          expect(handler.consumeOneFlap()).toBe(true);
          expect(handler.consumeOneFlap()).toBe(false);
        } finally {
          handler.dispose();
        }
      }),
      { numRuns: 100 }
    );
  });

  it('produces the same consume sequence for any pair of sources dispatched to fresh handlers', () => {
    fc.assert(
      fc.property(sourceArb, sourceArb, (a, b) => {
        const run = (sourceName) => {
          const target = makeTarget();
          const handler = createInputHandler(target);
          try {
            const before = handler.consumeOneFlap();
            target.dispatchEvent(SOURCES[sourceName]());
            const first = handler.consumeOneFlap();
            const second = handler.consumeOneFlap();
            return [before, first, second];
          } finally {
            handler.dispose();
          }
        };

        // The normalized signal and resulting state change are identical
        // regardless of which input source generated the flap (R2.4).
        expect(run(a)).toEqual(run(b));
        // And that shared sequence is the expected [none, flap, none].
        expect(run(a)).toEqual([false, true, false]);
      }),
      { numRuns: 100 }
    );
  });
});
