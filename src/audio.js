/**
 * audio.js — Flappy Kiro audio playback module.
 *
 * Side-effecting module that preloads the two game sound clips and exposes two
 * fire-and-forget play functions:
 *
 * - `playFlap()`      — plays `assets/jump.wav` once per Flap_Input (R2.2).
 * - `playGameOver()`  — plays `assets/game_over.wav` once per game over (R8.1).
 *
 * Each call restarts the clip from the beginning (via `currentTime = 0`) so
 * rapid successive flaps each produce an audible sound rather than a single
 * overlapping playback. `play()` may return a promise that rejects when the
 * browser blocks autoplay/unprimed audio; every playback is wrapped in a
 * try/catch plus a `.catch()` so a blocked or failed clip degrades silently
 * and never throws or interrupts gameplay (design.md Error Handling: audio
 * blocked -> silent).
 *
 * The factory `createAudioManager(deps)` injects the `Audio` constructor and
 * asset URLs so tests can run under jsdom (where `Audio` may be a stub) and
 * verify behavior without touching real audio hardware.
 *
 * _Requirements: 2.2, 8.1_
 */

/** Default asset URL for the flap/jump sound. */
const DEFAULT_FLAP_URL = 'assets/jump.wav';
/** Default asset URL for the game-over sound. */
const DEFAULT_GAME_OVER_URL = 'assets/game_over.wav';

/**
 * Attempt to play a preloaded audio clip from its start, swallowing any error.
 *
 * Resets `currentTime` so a clip already playing restarts, guaranteeing one
 * audible sound per call. `play()` can throw synchronously or return a
 * rejecting promise (autoplay policy); both paths are caught so playback
 * degrades silently.
 *
 * @param {{ currentTime?: number, play?: () => (Promise<void> | void) } | null | undefined} clip
 * @returns {void}
 */
function playClip(clip) {
  if (!clip || typeof clip.play !== 'function') {
    return; // No clip available (load failed / silent fallback): degrade silently.
  }
  try {
    // Restart from the beginning so rapid repeat calls each produce a sound.
    clip.currentTime = 0;
    const result = clip.play();
    // play() returns a promise in modern browsers; a blocked playback rejects.
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  } catch {
    // Synchronous failure (e.g. jsdom stub, blocked audio): ignore.
  }
}

/**
 * Create an AudioManager that preloads the flap and game-over clips.
 *
 * @param {object} [deps] Injectable dependencies for testability.
 * @param {new (src?: string) => HTMLAudioElement} [deps.AudioCtor]
 *   The `Audio` constructor. Defaults to the global `Audio` when available.
 * @param {string} [deps.flapUrl] URL for the flap sound. Defaults to `assets/jump.wav`.
 * @param {string} [deps.gameOverUrl] URL for the game-over sound. Defaults to `assets/game_over.wav`.
 * @returns {{ playFlap: () => void, playGameOver: () => void }}
 */
export function createAudioManager(deps = {}) {
  const {
    AudioCtor = typeof Audio !== 'undefined' ? Audio : undefined,
    flapUrl = DEFAULT_FLAP_URL,
    gameOverUrl = DEFAULT_GAME_OVER_URL,
  } = deps;

  /**
   * Preload a clip, returning `null` if no Audio constructor is available or
   * construction throws so callers degrade to silence.
   *
   * @param {string} url
   * @returns {HTMLAudioElement | null}
   */
  function preload(url) {
    if (typeof AudioCtor !== 'function') {
      return null;
    }
    try {
      const clip = new AudioCtor(url);
      // Hint the browser to fetch the clip eagerly where supported.
      try {
        clip.preload = 'auto';
      } catch {
        // Some stubs disallow setting preload; non-fatal.
      }
      return clip;
    } catch {
      return null;
    }
  }

  const flap = preload(flapUrl);
  const gameOver = preload(gameOverUrl);

  return {
    /**
     * Play the flap sound once. Safe to call rapidly; each call restarts the
     * clip so every flap is audible. Never throws.
     */
    playFlap() {
      playClip(flap);
    },

    /**
     * Play the game-over sound once. Never throws.
     */
    playGameOver() {
      playClip(gameOver);
    },
  };
}

export default createAudioManager;
