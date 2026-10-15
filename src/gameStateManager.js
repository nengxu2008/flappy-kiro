/**
 * gameStateManager.js — Flappy Kiro finite state machine + orchestration.
 *
 * `createGame(deps)` builds the authoritative game world and the Ready /
 * Playing / Game_Over state machine that drives it. It owns the mutable world
 * (ghost, pipes, clouds, score, high score, the Game_Over entry timestamp,
 * play area, assets, and the unsupported flag) and delegates all math to the
 * pure modules (physics, pipeManager, collision, score, background) and all
 * side effects to the injected audio and storage managers.
 *
 * The loop (gameLoop.js) calls `update(deltaSeconds)` once per frame and
 * `handleFlap()` for the at-most-one queued flap, then reads `getSnapshot()`
 * for the renderer. The manager never touches the DOM, the clock, or the
 * audio hardware directly — every such concern arrives through `deps` so the
 * whole FSM is deterministic and testable.
 *
 * Phases (design.md State Machine):
 *   'ready'    — Ghost idle, centered, vy = 0, no gravity (R1.2, R3.5). Clouds
 *                still advance (R9.4).
 *   'playing'  — gravity + flap + pipe scroll/spawn/cull + scoring + collision
 *                (R3, R4, R5, R6). Clouds advance.
 *   'gameOver' — Ghost and Pipes frozen (R8.2); high score persisted (R7);
 *                game-over sound played once (R8.1); a 500 ms input-ignore
 *                window gates the restart (R8.4). Clouds advance.
 *
 * Transitions:
 *   Ready   -> Playing  on an accepted flap: score resets to 0 (R6.1), ghost
 *             velocity set to FLAP_IMPULSE (R3.4), flap sound played (R2.2).
 *   Playing -> Game_Over on any collision (R5.1-5.3): evaluate/persist high
 *             score (R7.1, R7.5), play game-over sound once (R8.1), freeze the
 *             ghost and pipes (R8.2), start the 500 ms ignore window (R8.4).
 *   Game_Over -> Ready  on a flap at/after the ignore window (R8.5): reset
 *             score to 0, reset the ghost to its start position, clear pipes.
 *             The flap that leaves Game_Over is consumed by the reset and does
 *             not itself start play (design.md note).
 *
 * _Requirements: 1.4, 2.1, 2.3, 3.4, 3.5, 4.3, 5.1, 5.2, 5.3, 5.4, 6.1, 7.1,
 *                7.5, 8.1, 8.2, 8.4, 8.5, 9.4_
 */

import { CONFIG } from './config.js';
import { applyGravity, applyFlap, integrate } from './physics.js';
import {
  spawnPipe,
  advancePipes,
  cullOffscreen,
  needsSpawn,
} from './pipeManager.js';
import { ghostHitsPipe, ghostHitsBounds } from './collision.js';
import { scorePasses, nextHighScore } from './score.js';
import { advanceClouds, createClouds } from './background.js';
import {
  readHighScore as defaultReadHighScore,
  writeHighScore as defaultWriteHighScore,
} from './storage.js';

/** Valid game phases. */
export const PHASES = Object.freeze({
  READY: 'ready',
  PLAYING: 'playing',
  GAME_OVER: 'gameOver',
});

/**
 * Build the Ghost at its fixed start position: horizontally centered in the
 * Play_Area and vertically centered in it, at rest (R1.2, R3.5).
 *
 * @param {{width:number, height:number, groundHeight:number}} playArea
 * @returns {{x:number, y:number, vy:number, width:number, height:number}}
 */
function createGhost(playArea) {
  return {
    x: playArea.width / 2,
    y: playArea.height / 2,
    vy: 0,
    width: CONFIG.ghost.width,
    height: CONFIG.ghost.height,
  };
}

/**
 * Create a Flappy Kiro game instance: the authoritative world plus the FSM
 * that advances it.
 *
 * All collaborators are injected via `deps` so the manager stays pure of I/O
 * and fully testable. Sensible production defaults are supplied for each.
 *
 * @param {object} [deps]
 * @param {{playFlap: () => void, playGameOver: () => void}} [deps.audio]
 *   Audio manager. Defaults to a silent no-op so headless tests need not stub it.
 * @param {{readHighScore: () => number, writeHighScore: (v:number) => void}} [deps.storage]
 *   High-score persistence. Defaults to the real localStorage-backed module.
 * @param {() => number} [deps.rng] Returns a value in [0, 1) for pipe gaps.
 *   Defaults to `Math.random`.
 * @param {() => number} [deps.now] Monotonic-ish clock in milliseconds, used
 *   for the Game_Over ignore window. Defaults to `performance.now()` when
 *   available, otherwise `Date.now()`.
 * @param {{width:number, height:number, groundHeight:number}} [deps.playArea]
 *   Logical coordinate space. Defaults to `CONFIG.playArea`.
 * @param {{ghostImage: (CanvasImageSource|null), flap?: object, gameOver?: object}} [deps.assets]
 *   Loaded assets handed through to the renderer snapshot. Defaults to a null
 *   ghost image so the renderer draws a placeholder.
 * @param {boolean} [deps.unsupported] When true, the browser failed the
 *   capability check: the game can never enter Playing (R10.5).
 * @param {Array<object>} [deps.clouds] Initial cloud layout. Defaults to a
 *   freshly generated parallax set from `createClouds`.
 * @returns {{
 *   state: string,
 *   update: (deltaSeconds:number) => void,
 *   handleFlap: () => void,
 *   getSnapshot: () => object
 * }}
 */
export function createGame(deps = {}) {
  const {
    audio = { playFlap() {}, playGameOver() {} },
    storage = {
      readHighScore: defaultReadHighScore,
      writeHighScore: defaultWriteHighScore,
    },
    rng = Math.random,
    now = typeof performance !== 'undefined' &&
    typeof performance.now === 'function'
      ? () => performance.now()
      : () => Date.now(),
    playArea = CONFIG.playArea,
    assets = { ghostImage: null },
    unsupported = false,
    clouds = createClouds(playArea, 4, rng),
  } = deps;

  /** Authoritative mutable world owned by the manager. */
  const world = {
    phase: PHASES.READY,
    ghost: createGhost(playArea),
    pipes: [],
    clouds: clouds.slice(),
    score: 0,
    highScore: safeReadHighScore(),
    gameOverEnteredAt: null,
    playArea,
    assets,
    unsupported: Boolean(unsupported),
  };

  /**
   * Read the persisted high score, tolerating a storage object that omits or
   * throws from `readHighScore` (degrade to 0 per R1.8).
   * @returns {number}
   */
  function safeReadHighScore() {
    try {
      if (storage && typeof storage.readHighScore === 'function') {
        const value = storage.readHighScore();
        return Number.isFinite(value) && value >= 0 ? value : 0;
      }
    } catch {
      // Storage unavailable: fall back to 0.
    }
    return 0;
  }

  /** Reset the world to the Ready_State start conditions. */
  function resetToReady() {
    world.phase = PHASES.READY;
    world.ghost = createGhost(playArea);
    world.pipes = [];
    world.score = 0;
    world.gameOverEnteredAt = null;
  }

  // --- Transitions ------------------------------------------------------

  /**
   * Ready -> Playing (R2.1). Reset the score to 0 (R6.1), set the ghost's
   * velocity to the flap impulse (R3.4), play the flap sound (R2.2), and spawn
   * the first pipe off the right edge (R4.3).
   */
  function startPlaying() {
    world.phase = PHASES.PLAYING;
    world.score = 0;
    world.pipes = [];
    world.ghost = applyFlap(world.ghost);
    // Seed the first pipe just off the right edge so a gap scrolls into view.
    world.pipes = [spawnPipe(rng, playArea, playArea.width)];
    audio.playFlap();
  }

  /**
   * Playing -> Game_Over (R5.1-5.3). Evaluate and persist the high score
   * (R7.1, R7.5), play the game-over sound once (R8.1), freeze the ghost and
   * pipes (R8.2), and start the 500 ms input-ignore window (R8.4).
   */
  function endGame() {
    const updatedHigh = nextHighScore(world.score, world.highScore);
    if (updatedHigh > world.highScore) {
      world.highScore = updatedHigh;
      try {
        if (storage && typeof storage.writeHighScore === 'function') {
          storage.writeHighScore(updatedHigh);
        }
      } catch {
        // Best-effort persistence (R7.4): keep the in-memory high score.
      }
    }
    world.phase = PHASES.GAME_OVER;
    world.gameOverEnteredAt = now();
    audio.playGameOver();
    // Ghost and pipes are now frozen because update() skips their advancement
    // outside the Playing_State.
  }

  // --- Per-frame update -------------------------------------------------

  /**
   * Advance the active state by one frame. Clouds advance in every state
   * (R9.4); gravity, pipes, scoring, and collision run only while Playing.
   *
   * @param {number} deltaSeconds Frame delta in seconds (already clamped by the loop).
   */
  function update(deltaSeconds) {
    const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;

    // Parallax clouds drift in every phase (R9.4).
    world.clouds = advanceClouds(world.clouds, dt, playArea);

    if (world.phase !== PHASES.PLAYING) {
      // Ready holds the ghost still (vy = 0, no gravity); Game_Over freezes the
      // ghost and pipes. Neither advances the ghost or pipes (R3.5, R8.2).
      return;
    }

    // --- Playing_State simulation ---
    // Gravity then position integration (R3.1, R3.2, R3.3).
    world.ghost = applyGravity(world.ghost, dt);
    world.ghost = integrate(world.ghost, dt);

    // Scroll, spawn, and cull pipes (R4.1, R4.2, R4.3, R4.6).
    world.pipes = advancePipes(world.pipes, dt);
    if (needsSpawn(world.pipes, playArea)) {
      const lastPipeX = world.pipes.reduce(
        (max, pipe) => Math.max(max, pipe.x),
        playArea.width,
      );
      world.pipes = [...world.pipes, spawnPipe(rng, playArea, lastPipeX)];
    }
    world.pipes = cullOffscreen(world.pipes, playArea);

    // Score each pipe the ghost has passed, exactly once (R6.2, R6.4, R6.5).
    const { pipes: scoredPipes, gained } = scorePasses(world.ghost, world.pipes);
    world.pipes = scoredPipes;
    if (gained > 0) {
      world.score += gained;
    }

    // Collision ends the game (R5.1-5.3). Collisions are only evaluated while
    // Playing, so Ready/Game_Over never transition on geometry (R5.4).
    const hitBounds = ghostHitsBounds(world.ghost, playArea);
    const hitPipe = world.pipes.some((pipe) =>
      ghostHitsPipe(world.ghost, pipe, playArea),
    );
    if (hitBounds || hitPipe) {
      endGame();
    }
  }

  // --- Flap routing -----------------------------------------------------

  /**
   * Route a single Flap_Input by the current phase (R2.1, R8.5). An
   * unsupported browser never enters Playing (R10.5). In Game_Over, flaps
   * inside the 500 ms ignore window are discarded (R8.4).
   */
  function handleFlap() {
    if (world.unsupported) {
      return; // Capability check failed: never enter Playing (R10.5).
    }

    switch (world.phase) {
      case PHASES.READY:
        startPlaying();
        break;

      case PHASES.PLAYING:
        // Each accepted in-flight flap applies the impulse and plays a sound (R2.2, R2.3).
        world.ghost = applyFlap(world.ghost);
        audio.playFlap();
        break;

      case PHASES.GAME_OVER: {
        // Ignore flaps until the input-ignore window has elapsed (R8.4).
        const enteredAt = world.gameOverEnteredAt;
        if (enteredAt === null) {
          return;
        }
        const elapsed = now() - enteredAt;
        if (elapsed >= CONFIG.GAME_OVER_IGNORE_MS) {
          // Reset the world and return to Ready; this flap starts no play (R8.5).
          resetToReady();
        }
        break;
      }

      default:
        break;
    }
  }

  // --- Immutable snapshot for the renderer ------------------------------

  /**
   * Return an immutable view of the world for the renderer. Nested arrays and
   * objects are shallow-cloned and frozen so the renderer cannot mutate the
   * authoritative state (design.md: Renderer reads an immutable snapshot).
   *
   * @returns {{
   *   phase: string,
   *   ghost: object,
   *   pipes: Array<object>,
   *   clouds: Array<object>,
   *   score: number,
   *   highScore: number,
   *   gameOverEnteredAt: (number|null),
   *   playArea: object,
   *   assets: object,
   *   unsupported: boolean
   * }}
   */
  function getSnapshot() {
    return Object.freeze({
      phase: world.phase,
      ghost: Object.freeze({ ...world.ghost }),
      pipes: Object.freeze(world.pipes.map((pipe) => Object.freeze({ ...pipe }))),
      clouds: Object.freeze(
        world.clouds.map((cloud) => Object.freeze({ ...cloud })),
      ),
      score: world.score,
      highScore: world.highScore,
      gameOverEnteredAt: world.gameOverEnteredAt,
      playArea: Object.freeze({ ...world.playArea }),
      assets: world.assets,
      unsupported: world.unsupported,
    });
  }

  return {
    /** Current phase. Exposed as a live getter so callers always read fresh. */
    get state() {
      return world.phase;
    },
    update,
    handleFlap,
    getSnapshot,
  };
}

export default createGame;
