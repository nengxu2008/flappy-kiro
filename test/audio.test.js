import { describe, it, expect, beforeEach } from 'vitest';

import { createAudioManager } from '../src/audio.js';

/**
 * Integration tests for audio playback (Task 9.7).
 *
 * These exercise the real `createAudioManager` factory with an injected
 * `StubAudio` constructor standing in for the browser `Audio` element. The stub
 * records `play()` invocations and `currentTime` resets per instance and can be
 * configured to return a rejecting promise to simulate a browser that blocks
 * unprimed/autoplay audio.
 *
 * _Requirements: 2.2, 8.1_
 */

const FLAP_URL = 'assets/jump.wav';
const GAME_OVER_URL = 'assets/game_over.wav';

/**
 * Instances created by the StubAudio constructor, in construction order. The
 * AudioManager preloads the flap clip first and the game-over clip second, so
 * instances[0] is the flap clip and instances[1] is the game-over clip.
 * @type {StubAudio[]}
 */
let instances;

/**
 * A stand-in for the browser `Audio` constructor. Records every `play()` call
 * and `currentTime` assignment so tests can assert exactly-once semantics and
 * the start-from-zero restart behavior. By default `play()` resolves; set
 * `rejectPlay = true` to simulate blocked playback (a rejecting promise).
 */
class StubAudio {
  constructor(src) {
    this.src = src;
    this.preload = '';
    this.playCount = 0;
    /** Records the value `currentTime` was set to before each play(). */
    this.currentTimeSets = [];
    this._currentTime = 0;
    /** When true, play() returns a rejecting promise (blocked playback). */
    this.rejectPlay = false;
    instances.push(this);
  }

  get currentTime() {
    return this._currentTime;
  }

  set currentTime(value) {
    this._currentTime = value;
    this.currentTimeSets.push(value);
  }

  play() {
    this.playCount += 1;
    if (this.rejectPlay) {
      return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    }
    return Promise.resolve();
  }
}

beforeEach(() => {
  instances = [];
});

/** Build an AudioManager wired to fresh StubAudio clips; returns manager + clips. */
function makeManager() {
  const manager = createAudioManager({
    AudioCtor: StubAudio,
    flapUrl: FLAP_URL,
    gameOverUrl: GAME_OVER_URL,
  });
  // Preload order in createAudioManager: flap first, then game-over.
  const [flapClip, gameOverClip] = instances;
  return { manager, flapClip, gameOverClip };
}

describe('audio playback integration (Task 9.7)', () => {
  it('preloads exactly the flap and game-over clips from the injected URLs', () => {
    const { flapClip, gameOverClip } = makeManager();

    expect(instances).toHaveLength(2);
    expect(flapClip.src).toBe(FLAP_URL);
    expect(gameOverClip.src).toBe(GAME_OVER_URL);
    // Nothing has played yet.
    expect(flapClip.playCount).toBe(0);
    expect(gameOverClip.playCount).toBe(0);
  });

  it('playFlap() fires exactly one play() on the flap clip per flap', () => {
    const { manager, flapClip, gameOverClip } = makeManager();

    manager.playFlap();

    expect(flapClip.playCount).toBe(1);
    // The flap must not touch the game-over clip.
    expect(gameOverClip.playCount).toBe(0);
  });

  it('each playFlap() call resets currentTime so rapid flaps each sound', () => {
    const { manager, flapClip } = makeManager();

    manager.playFlap();
    manager.playFlap();
    manager.playFlap();

    // One play() per flap — three flaps, three plays.
    expect(flapClip.playCount).toBe(3);
    // currentTime reset to 0 before each play so the clip restarts every time
    // rather than being a no-op while already playing.
    expect(flapClip.currentTimeSets).toEqual([0, 0, 0]);
  });

  it('playGameOver() fires exactly one play() on the game-over clip per transition', () => {
    const { manager, flapClip, gameOverClip } = makeManager();

    manager.playGameOver();

    expect(gameOverClip.playCount).toBe(1);
    expect(gameOverClip.currentTimeSets).toEqual([0]);
    // The game-over sound must not touch the flap clip.
    expect(flapClip.playCount).toBe(0);
  });

  it('plays each clip once per corresponding event over a mixed sequence', () => {
    const { manager, flapClip, gameOverClip } = makeManager();

    // Two flaps during play, then a single game-over transition.
    manager.playFlap();
    manager.playFlap();
    manager.playGameOver();

    expect(flapClip.playCount).toBe(2);
    expect(gameOverClip.playCount).toBe(1);
  });

  it('does not throw and still invokes play() when flap playback is blocked', async () => {
    const { manager, flapClip } = makeManager();
    flapClip.rejectPlay = true;

    // A rejecting play() promise must not surface as a throw out of playFlap.
    expect(() => manager.playFlap()).not.toThrow();
    // The play() attempt still happened once (blocking is the browser's choice).
    expect(flapClip.playCount).toBe(1);

    // Flush microtasks so any unhandled rejection would surface; the manager
    // attaches a .catch() so this stays silent and gameplay is uninterrupted.
    await Promise.resolve();
    await Promise.resolve();
  });

  it('does not throw and still invokes play() when game-over playback is blocked', async () => {
    const { manager, gameOverClip } = makeManager();
    gameOverClip.rejectPlay = true;

    expect(() => manager.playGameOver()).not.toThrow();
    expect(gameOverClip.playCount).toBe(1);

    await Promise.resolve();
    await Promise.resolve();
  });

  it('keeps serving subsequent flaps after a blocked playback (state not interrupted)', async () => {
    const { manager, flapClip } = makeManager();

    flapClip.rejectPlay = true;
    manager.playFlap();
    await Promise.resolve();

    // Recover: a later flap once playback is allowed again still fires exactly once.
    flapClip.rejectPlay = false;
    expect(() => manager.playFlap()).not.toThrow();
    expect(flapClip.playCount).toBe(2);
    expect(flapClip.currentTimeSets).toEqual([0, 0]);
  });
});
