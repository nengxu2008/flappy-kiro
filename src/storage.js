/**
 * storage.js — Flappy Kiro high-score storage module.
 *
 * This file provides both halves of the storage concern:
 *
 * - The PURE parsing half (`parseHighScore`), kept side-effect-free so it can
 *   be property-tested in isolation. It normalizes whatever was read from
 *   Local_Storage into a valid non-negative integer, returning 0 for any value
 *   that is not one: `null`, non-numeric strings, floats, negatives, or values
 *   beyond the safe integer range (R1.5, R1.6, R1.7).
 * - The side-effecting I/O half (`readHighScore` / `writeHighScore`) that wraps
 *   `localStorage` access in `try/catch` and delegates normalization to
 *   `parseHighScore` (R1.5–R1.8, R7.3, R7.4).
 *
 * _Requirements: 1.5, 1.6, 1.7, 1.8, 7.3, 7.4_
 */

/**
 * Map a raw Local_Storage value to a valid non-negative integer high score.
 *
 * Returns 0 when `raw` is `null`, cannot be parsed as a number, is not an
 * integer (e.g. a float), is negative, or exceeds `Number.MAX_SAFE_INTEGER`
 * ("oversized"). Otherwise returns the parsed non-negative integer.
 *
 * Pure: no `localStorage` access, no mutation, no globals.
 *
 * @param {string | null} raw The raw stored value (or `null` when absent).
 * @returns {number} A non-negative integer; 0 for any invalid input.
 */
export function parseHighScore(raw) {
  if (raw === null || raw === undefined) {
    return 0;
  }

  // Number(trimmed) rejects non-numeric strings (-> NaN) and tolerates
  // surrounding whitespace. An empty/whitespace-only string becomes 0, which
  // is already a valid non-negative integer.
  const value = Number(String(raw).trim());

  if (!Number.isFinite(value)) {
    return 0; // non-numeric (NaN) or Infinity
  }
  if (!Number.isInteger(value)) {
    return 0; // float
  }
  if (value < 0) {
    return 0; // negative
  }
  if (value > Number.MAX_SAFE_INTEGER) {
    return 0; // oversized
  }

  return value;
}

export default parseHighScore;

/**
 * Local_Storage key under which the High_Score is persisted across sessions.
 * @type {string}
 */
export const HIGH_SCORE_KEY = 'flappyKiro.highScore';

/**
 * Read the persisted High_Score from Local_Storage as a valid non-negative
 * integer, degrading to 0 whenever storage is unavailable, missing, or invalid.
 *
 * Behavior:
 * - Reads the raw value via `localStorage.getItem` and normalizes it with the
 *   pure `parseHighScore` (R1.5, R1.6, R1.7).
 * - If the raw value was present (non-null) but normalized to 0 — i.e. it was
 *   an invalid stored value — the stored value is best-effort overwritten with
 *   '0' so a corrupt entry self-heals (R1.7). A failure to overwrite is
 *   swallowed and does not affect the returned value.
 * - If reading throws or `localStorage` is unavailable, returns 0 and lets the
 *   Game continue into the Ready_State uninterrupted (R1.8).
 *
 * @returns {number} The stored High_Score as a non-negative integer, else 0.
 */
export function readHighScore() {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    const value = parseHighScore(raw);

    // A present-but-invalid stored value normalizes to 0: self-heal the store.
    if (raw !== null && value === 0) {
      try {
        localStorage.setItem(HIGH_SCORE_KEY, '0');
      } catch {
        // Best-effort overwrite; ignore failures (quota, private mode, etc.).
      }
    }

    return value;
  } catch {
    // Local_Storage unavailable or getItem threw (R1.8): fall back to 0.
    return 0;
  }
}

/**
 * Persist the High_Score to Local_Storage on a best-effort basis.
 *
 * Writes `value` under `HIGH_SCORE_KEY`. Any failure (quota exceeded, private
 * mode, storage unavailable) is swallowed so the caller's in-memory High_Score
 * is retained for the session and gameplay continues uninterrupted (R7.3, R7.4).
 *
 * @param {number} value The High_Score to persist.
 * @returns {void}
 */
export function writeHighScore(value) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(value));
  } catch {
    // Best-effort write (R7.4): swallow errors, retain the in-memory value.
  }
}
