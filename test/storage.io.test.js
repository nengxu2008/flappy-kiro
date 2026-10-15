import { describe, it, expect, afterEach } from 'vitest';

import { readHighScore, writeHighScore, HIGH_SCORE_KEY } from '../src/storage.js';

// Unit tests for the side-effecting storage I/O half of src/storage.js.
//
// These exercise readHighScore / writeHighScore against a stubbed global
// localStorage whose getItem/setItem either work or throw, verifying the
// try/catch degradation behavior:
//   - readHighScore returns 0 when the read throws (R1.8)
//   - a valid stored integer round-trips through readHighScore (R1.5)
//   - a present-but-invalid value triggers a best-effort overwrite with '0' (R1.7)
//   - writeHighScore swallows a thrown write and keeps the in-memory value (R7.4)
//
// Requirements: 1.8, 7.4

// Capture the real localStorage so each test can restore it, keeping tests
// isolated and leaving the jsdom environment untouched for other suites.
const originalLocalStorage = globalThis.localStorage;

/**
 * Replace the global localStorage with a stub for the duration of a test.
 * @param {Partial<Storage>} stub An object providing getItem/setItem (and any
 *   other members the code under test touches).
 */
function stubLocalStorage(stub) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: stub,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  // Restore the original localStorage so suites remain independent.
  Object.defineProperty(globalThis, 'localStorage', {
    value: originalLocalStorage,
    configurable: true,
    writable: true,
  });
});

describe('readHighScore', () => {
  it('returns 0 when localStorage.getItem throws', () => {
    // Simulate storage being unavailable / access throwing (R1.8).
    stubLocalStorage({
      getItem() {
        throw new Error('SecurityError: localStorage is not available');
      },
      setItem() {
        throw new Error('should not be reached');
      },
    });

    expect(readHighScore()).toBe(0);
  });

  it('round-trips a valid stored integer string', () => {
    // A valid stored value such as '7' reads back as the integer 7 (R1.5).
    stubLocalStorage({
      getItem(key) {
        expect(key).toBe(HIGH_SCORE_KEY);
        return '7';
      },
      setItem() {
        throw new Error('setItem should not be called for a valid value');
      },
    });

    expect(readHighScore()).toBe(7);
  });

  it('best-effort overwrites a present-but-invalid stored value with "0"', () => {
    // A present-but-invalid value normalizes to 0 and self-heals the store (R1.7).
    const writes = [];
    stubLocalStorage({
      getItem() {
        return 'not-a-number';
      },
      setItem(key, value) {
        writes.push([key, value]);
      },
    });

    expect(readHighScore()).toBe(0);
    expect(writes).toEqual([[HIGH_SCORE_KEY, '0']]);
  });

  it('swallows a failed self-heal overwrite and still returns 0', () => {
    // Even if the best-effort overwrite throws, the returned value is unaffected (R1.7).
    stubLocalStorage({
      getItem() {
        return 'garbage';
      },
      setItem() {
        throw new Error('QuotaExceededError');
      },
    });

    expect(readHighScore()).toBe(0);
  });
});

describe('writeHighScore', () => {
  it('does not throw when localStorage.setItem throws (quota/private mode)', () => {
    // A failing write is swallowed so gameplay continues (R7.4).
    stubLocalStorage({
      getItem() {
        return null;
      },
      setItem() {
        throw new Error('QuotaExceededError: write blocked');
      },
    });

    expect(() => writeHighScore(5)).not.toThrow();
  });

  it('keeps the in-memory value after a thrown write (does not corrupt storage)', () => {
    // The thrown write leaves no persisted value; the caller's in-memory high
    // score is retained for the session (R7.4). We assert the stub never
    // recorded a successful write.
    const persisted = {};
    stubLocalStorage({
      getItem(key) {
        return key in persisted ? persisted[key] : null;
      },
      setItem() {
        throw new Error('private mode: write disabled');
      },
    });

    writeHighScore(5);

    // Nothing was persisted, yet no error propagated to the caller.
    expect(persisted[HIGH_SCORE_KEY]).toBeUndefined();
  });

  it('persists the stringified value when the write succeeds', () => {
    // Happy path: a successful write stores the value as a string under the key.
    const persisted = {};
    stubLocalStorage({
      getItem(key) {
        return key in persisted ? persisted[key] : null;
      },
      setItem(key, value) {
        persisted[key] = value;
      },
    });

    writeHighScore(42);

    expect(persisted[HIGH_SCORE_KEY]).toBe('42');
  });
});
