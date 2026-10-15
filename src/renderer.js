/**
 * renderer.js — Flappy Kiro Canvas 2D renderer (side-effecting).
 *
 * Draws the whole scene from an immutable snapshot produced by
 * `gameStateManager.getSnapshot()`. The renderer is the only module that
 * touches the Canvas 2D context; it performs NO mutation of the snapshot and
 * holds no gameplay state of its own, so swapping the real context for a
 * recording mock makes the draw output fully assertable (design.md Renderer).
 *
 * Draw order (back-to-front), exactly as specified (R9.*):
 *   1. Light blue background fill over the whole Play_Area (R1.3, R9.2).
 *   2. Rounded white Clouds at their configured opacity (R9.2, R9.3).
 *   3. Green Pipes — top segment from the Ceiling to the Gap top, bottom
 *      segment from the Gap bottom to the Ground top (R4.7, R9.8).
 *   4. Dark gray Ground strip spanning the full width along the bottom (R9.9).
 *   5. Ghost — `assets.ghostImage` scaled to its box, or a solid white
 *      placeholder shape when the image failed to load (R9.1, R9.11).
 *   6. Score text `Score: {current} | High: {high}` near the bottom (R6.3,
 *      R9.10).
 *   7. Game-over overlay (indicator + restart prompt) when phase is
 *      'gameOver', with the score still visible (R7.5, R8.3).
 *
 * Canvas convention: origin top-left, Y increases downward. The Ghost's `x,y`
 * is its CENTER, so its box spans `x - width/2 .. x + width/2` and
 * `y - height/2 .. y + height/2`. A Pipe's `x` is its center-line, so its body
 * spans `x - width/2 .. x + width/2`.
 *
 * _Requirements: 1.3, 6.3, 7.5, 8.3, 9.1, 9.2, 9.8, 9.9, 9.10, 9.11_
 */

import { formatScore } from './format.js';
import { CONFIG } from './config.js';

// --- Palette (hand-drawn retro reference) ---
/** Light blue sky background (R1.3, R9.2). */
const COLOR_BACKGROUND = '#87CEEB';
/** Rounded white clouds (R9.2). */
const COLOR_CLOUD = '#FFFFFF';
/** Green pipe body, top and bottom segments (R9.8). */
const COLOR_PIPE = '#2E8B57';
/** Gold collectible coin (bonus scoring; no sprite asset — drawn as a disc). */
const COLOR_COIN = '#FFD700';
/** Dark gray ground strip (R9.9). */
const COLOR_GROUND = '#555555';
/** Solid white placeholder when the ghost image is missing (R9.11). */
const COLOR_GHOST_PLACEHOLDER = '#FFFFFF';
/** Score readout text (R9.10). */
const COLOR_SCORE_TEXT = '#333333';
/** Dimming veil behind the game-over overlay (R8.3). */
const COLOR_OVERLAY_VEIL = 'rgba(0, 0, 0, 0.45)';
/** Game-over overlay text (R8.3). */
const COLOR_OVERLAY_TEXT = '#FFFFFF';

/** Game-over phase identifier (matches gameStateManager PHASES.GAME_OVER). */
const PHASE_GAME_OVER = 'gameOver';

/**
 * Trace a rounded-rectangle path on the context (clouds and the ghost
 * placeholder). Falls back gracefully for degenerate sizes.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x Left edge.
 * @param {number} y Top edge.
 * @param {number} width
 * @param {number} height
 * @param {number} radius Corner radius (clamped to half the smaller side).
 * @returns {void}
 */
function traceRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Fill the light blue background over the entire Play_Area (R1.3, R9.2).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{width:number, height:number}} playArea
 * @returns {void}
 */
function drawBackground(ctx, playArea) {
  ctx.fillStyle = COLOR_BACKGROUND;
  ctx.fillRect(0, 0, playArea.width, playArea.height);
}

/**
 * Draw each rounded white Cloud at its own fixed opacity so the background
 * shows through (R9.2, R9.3). `globalAlpha` is set/restored around each cloud
 * via save/restore so no other draw is affected.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number, y:number, width:number, height:number, opacity:number}>} clouds
 * @returns {void}
 */
function drawClouds(ctx, clouds) {
  for (const cloud of clouds) {
    ctx.save();
    ctx.globalAlpha = cloud.opacity;
    ctx.fillStyle = COLOR_CLOUD;
    // Rounded shape; radius ~ half the height for a soft puffy look.
    traceRoundedRect(ctx, cloud.x, cloud.y, cloud.width, cloud.height, cloud.height / 2);
    ctx.fill();
    ctx.restore();
  }
}

/**
 * Draw every Pipe in green as two segments separated by its Gap (R4.7, R9.8).
 *
 * Top segment: Ceiling (y = 0) down to the Gap's top edge (gapY - gapHeight/2).
 * Bottom segment: the Gap's bottom edge (gapY + gapHeight/2) down to the top of
 * the Ground (playArea.height - groundHeight). Each segment spans the pipe body
 * horizontally from x - width/2 to x + width/2.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number, gapY:number, gapHeight:number, width:number}>} pipes
 * @param {{width:number, height:number, groundHeight:number}} playArea
 * @returns {void}
 */
function drawPipes(ctx, pipes, playArea) {
  const groundTop = playArea.height - playArea.groundHeight;
  ctx.fillStyle = COLOR_PIPE;
  for (const pipe of pipes) {
    const left = pipe.x - pipe.width / 2;
    const gapTop = pipe.gapY - pipe.gapHeight / 2;
    const gapBottom = pipe.gapY + pipe.gapHeight / 2;

    // Top segment: from the Ceiling down to the top edge of the Gap.
    const topHeight = gapTop;
    if (topHeight > 0) {
      ctx.fillRect(left, 0, pipe.width, topHeight);
    }

    // Bottom segment: from the bottom edge of the Gap down to the Ground.
    const bottomHeight = groundTop - gapBottom;
    if (bottomHeight > 0) {
      ctx.fillRect(left, gapBottom, pipe.width, bottomHeight);
    }
  }
}

/**
 * Draw every collectible Coin as a gold filled disc (there is no coin sprite
 * asset, so this is the intended graceful default). Center coordinates are
 * rounded to integers to avoid sub-pixel smoothing. `fillStyle` is set once
 * before the loop and the whole batch is wrapped in save/restore so the color
 * does not leak into later draws. Already-collected coins are skipped
 * defensively (the snapshot normally omits them once culled).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<{x:number, y:number, width:number, height:number, collected:boolean}>} coins
 * @returns {void}
 */
function drawCoins(ctx, coins) {
  if (!coins || coins.length === 0) return;

  ctx.save();
  ctx.fillStyle = COLOR_COIN;
  for (const coin of coins) {
    if (coin.collected) continue;
    const cx = Math.round(coin.x);
    const cy = Math.round(coin.y);
    const radius = Math.min(coin.width, coin.height) / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draw the dark gray Ground strip spanning the full width along the bottom edge
 * of the Play_Area (R9.9).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{width:number, height:number, groundHeight:number}} playArea
 * @returns {void}
 */
function drawGround(ctx, playArea) {
  const groundTop = playArea.height - playArea.groundHeight;
  ctx.fillStyle = COLOR_GROUND;
  ctx.fillRect(0, groundTop, playArea.width, playArea.groundHeight);
}

/**
 * Draw the Ghost at its bounding box. When `assets.ghostImage` is a loaded
 * image, scale it to the Ghost's size (R9.1); when it is null, draw a solid
 * white rounded-rect placeholder so the Ghost stays visible (R9.11).
 *
 * The Ghost's x,y is its center, so the box's top-left is
 * (x - width/2, y - height/2).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x:number, y:number, width:number, height:number}} ghost
 * @param {{ghostImage: (CanvasImageSource|null)}} assets
 * @returns {void}
 */
function drawGhost(ctx, ghost, assets) {
  const left = ghost.x - ghost.width / 2;
  const top = ghost.y - ghost.height / 2;
  const image = assets ? assets.ghostImage : null;

  if (image) {
    // Scale the sprite to the Ghost's fixed box (R9.1).
    ctx.drawImage(image, left, top, ghost.width, ghost.height);
    return;
  }

  // Image failed to load: solid white placeholder shape (R9.11).
  ctx.save();
  ctx.fillStyle = COLOR_GHOST_PLACEHOLDER;
  traceRoundedRect(ctx, left, top, ghost.width, ghost.height, ghost.height / 4);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw the score readout `Score: {current} | High: {high}` near the bottom of
 * the Play_Area, centered horizontally over the Ground strip (R6.3, R9.10).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} score
 * @param {number} highScore
 * @param {{width:number, height:number, groundHeight:number}} playArea
 * @returns {void}
 */
function drawScore(ctx, score, highScore, playArea) {
  const text = formatScore(score, highScore);
  // Vertically center the text within the Ground strip along the bottom.
  const y = playArea.height - playArea.groundHeight / 2;

  ctx.save();
  ctx.fillStyle = COLOR_SCORE_TEXT;
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, playArea.width / 2, y);
  ctx.restore();
}

/**
 * Draw the Game_Over overlay: a dimming veil, a game-over indicator, and a
 * textual restart prompt, centered over the Play_Area (R8.3). The score
 * readout underneath remains visible because it is drawn before this overlay
 * and the veil is translucent (R7.5, R8.3).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {{width:number, height:number}} playArea
 * @returns {void}
 */
function drawGameOverOverlay(ctx, playArea) {
  const centerX = playArea.width / 2;
  const centerY = playArea.height / 2;

  ctx.save();

  // Translucent veil so the frozen scene and score stay visible underneath.
  ctx.fillStyle = COLOR_OVERLAY_VEIL;
  ctx.fillRect(0, 0, playArea.width, playArea.height);

  ctx.fillStyle = COLOR_OVERLAY_TEXT;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Game-over indicator.
  ctx.font = 'bold 40px sans-serif';
  ctx.fillText('Game Over', centerX, centerY - 24);

  // Textual restart prompt.
  ctx.font = '18px sans-serif';
  ctx.fillText('Flap to play again', centerX, centerY + 20);

  ctx.restore();
}

/**
 * Draw a single frame from an immutable snapshot. Reads only; mutates nothing.
 *
 * @param {CanvasRenderingContext2D} ctx The Canvas 2D context to draw into.
 * @param {{
 *   phase: string,
 *   ghost: {x:number, y:number, width:number, height:number},
 *   pipes: Array<{x:number, gapY:number, gapHeight:number, width:number}>,
 *   coins: Array<{x:number, y:number, width:number, height:number, collected:boolean}>,
 *   clouds: Array<{x:number, y:number, width:number, height:number, opacity:number}>,
 *   score: number,
 *   highScore: number,
 *   playArea: {width:number, height:number, groundHeight:number},
 *   assets: {ghostImage: (CanvasImageSource|null)}
 * }} snapshot The immutable world view from gameStateManager.getSnapshot().
 * @returns {void}
 */
export function render(ctx, snapshot) {
  const { playArea = CONFIG.playArea } = snapshot;

  // Back-to-front draw order (see module header).
  drawBackground(ctx, playArea);
  drawClouds(ctx, snapshot.clouds);
  drawPipes(ctx, snapshot.pipes, playArea);
  drawCoins(ctx, snapshot.coins);
  drawGround(ctx, playArea);
  drawGhost(ctx, snapshot.ghost, snapshot.assets);
  drawScore(ctx, snapshot.score, snapshot.highScore, playArea);

  if (snapshot.phase === PHASE_GAME_OVER) {
    drawGameOverOverlay(ctx, playArea);
  }
}

/**
 * Create a renderer bound to a fixed Canvas 2D context. The returned object's
 * `render(snapshot)` matches the game loop's expected `render()` collaborator
 * (design.md loop step 4).
 *
 * The optional `deps` is reserved for future injection (e.g. a palette or
 * clock) and is currently unused; it keeps the factory signature forward
 * compatible without changing call sites.
 *
 * @param {CanvasRenderingContext2D} ctx The context every frame draws into.
 * @param {object} [deps] Reserved for future injectable dependencies.
 * @returns {{ render: (snapshot: object) => void }}
 */
export function createRenderer(ctx, deps = {}) {
  // deps is intentionally unused for now; see JSDoc above.
  void deps;
  return {
    /**
     * Draw one frame from the given immutable snapshot into the bound context.
     * @param {object} snapshot
     * @returns {void}
     */
    render(snapshot) {
      render(ctx, snapshot);
    },
  };
}

export default createRenderer;
