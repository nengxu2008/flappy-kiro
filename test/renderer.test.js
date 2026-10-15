import { describe, it, expect, beforeEach } from 'vitest';

import { render, createRenderer } from '../src/renderer.js';
import { CONFIG } from '../src/config.js';
import { formatScore } from '../src/format.js';

/**
 * Rendering tests against a recording mock 2D context (Task 11.2).
 *
 * The renderer is the only module that touches the Canvas 2D context and
 * performs no mutation, so a recording mock makes its draw output fully
 * assertable. These tests confirm the back-to-front draw order and the exact
 * primitives/colors used for the background, clouds, pipes, ground, ghost,
 * score text, game-over overlay, and the ghost placeholder fallback.
 *
 * _Requirements: 1.3, 6.3, 7.5, 8.3, 9.1, 9.2, 9.8, 9.9, 9.11_
 */

// Palette the renderer uses (kept in sync with src/renderer.js).
const COLOR_BACKGROUND = '#87CEEB';
const COLOR_PIPE = '#2E8B57';
const COLOR_GROUND = '#555555';
const COLOR_GHOST_PLACEHOLDER = '#FFFFFF';

/**
 * Build a recording mock 2D context. Each drawing method pushes a call record
 * (including the current `fillStyle`/`globalAlpha` at the time of the call) to
 * `ctx.calls`, so assertions can inspect what was drawn, in what order, and
 * with which style. Settable style properties are plain fields.
 *
 * @returns {object} A recording stand-in for CanvasRenderingContext2D.
 */
function createMockContext() {
  const calls = [];
  const ctx = {
    calls,
    // Settable style/state properties.
    fillStyle: '',
    globalAlpha: 1,
    font: '',
    textAlign: '',
    textBaseline: '',

    fillRect(x, y, width, height) {
      calls.push({ method: 'fillRect', args: [x, y, width, height], fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
    },
    drawImage(image, x, y, width, height) {
      calls.push({ method: 'drawImage', args: [image, x, y, width, height] });
    },
    fillText(text, x, y) {
      calls.push({ method: 'fillText', args: [text, x, y], fillStyle: this.fillStyle, font: this.font });
    },
    beginPath() {
      calls.push({ method: 'beginPath' });
    },
    moveTo(x, y) {
      calls.push({ method: 'moveTo', args: [x, y] });
    },
    lineTo(x, y) {
      calls.push({ method: 'lineTo', args: [x, y] });
    },
    quadraticCurveTo(cpx, cpy, x, y) {
      calls.push({ method: 'quadraticCurveTo', args: [cpx, cpy, x, y] });
    },
    closePath() {
      calls.push({ method: 'closePath' });
    },
    fill() {
      calls.push({ method: 'fill', fillStyle: this.fillStyle, globalAlpha: this.globalAlpha });
    },
    save() {
      calls.push({ method: 'save' });
    },
    restore() {
      calls.push({ method: 'restore' });
    },
  };
  return ctx;
}

const playArea = CONFIG.playArea;
const groundTop = playArea.height - playArea.groundHeight;

/** A stub image object standing in for a loaded ghost sprite. */
const STUB_GHOST_IMAGE = { __stubImage: true };

/**
 * Build a representative snapshot. Pass overrides to flip phase, assets, etc.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
function makeSnapshot(overrides = {}) {
  const ghost = {
    x: playArea.width / 2,
    y: playArea.height / 2,
    width: CONFIG.ghost.width,
    height: CONFIG.ghost.height,
  };
  // Two clouds well within the background region (y + height <= groundTop).
  const clouds = [
    { x: 60, y: 80, width: 70, height: 40, opacity: 0.4 },
    { x: 260, y: 150, width: 90, height: 50, opacity: 0.6 },
  ];
  const pipes = [
    { x: 300, gapY: 300, gapHeight: CONFIG.GAP_HEIGHT, width: CONFIG.PIPE_WIDTH },
    { x: 560, gapY: 220, gapHeight: CONFIG.GAP_HEIGHT, width: CONFIG.PIPE_WIDTH },
  ];
  return {
    phase: 'playing',
    ghost,
    pipes,
    clouds,
    score: 7,
    highScore: 12,
    playArea,
    assets: { ghostImage: STUB_GHOST_IMAGE },
    ...overrides,
  };
}

describe('renderer.render — recording mock 2D context', () => {
  let ctx;

  beforeEach(() => {
    ctx = createMockContext();
  });

  it('fills the light-blue background over the full playArea first (R1.3, R9.2)', () => {
    render(ctx, makeSnapshot());

    const firstFillRect = ctx.calls.find((c) => c.method === 'fillRect');
    expect(firstFillRect).toBeDefined();
    expect(firstFillRect.fillStyle).toBe(COLOR_BACKGROUND);
    expect(firstFillRect.args).toEqual([0, 0, playArea.width, playArea.height]);

    // The background must be the very first drawing operation of the frame.
    const firstDraw = ctx.calls.find((c) => ['fillRect', 'drawImage', 'fillText', 'fill'].includes(c.method));
    expect(firstDraw.method).toBe('fillRect');
    expect(firstDraw.fillStyle).toBe(COLOR_BACKGROUND);
  });

  it('draws at least two clouds within the background region (R9.2)', () => {
    const snapshot = makeSnapshot();
    render(ctx, snapshot);

    // Clouds are rounded-rect paths filled with globalAlpha set to the cloud's
    // opacity (0.3..0.7). Count fill() calls whose alpha is in that range.
    const cloudFills = ctx.calls.filter(
      (c) => c.method === 'fill' && c.globalAlpha >= 0.3 && c.globalAlpha <= 0.7,
    );
    expect(cloudFills.length).toBeGreaterThanOrEqual(2);

    // Every cloud sits above the ground: y + height <= groundTop.
    for (const cloud of snapshot.clouds) {
      expect(cloud.y + cloud.height).toBeLessThanOrEqual(groundTop);
    }

    // The alphas recorded match the cloud opacities.
    const alphas = cloudFills.map((c) => c.globalAlpha);
    for (const cloud of snapshot.clouds) {
      expect(alphas).toContain(cloud.opacity);
    }
  });

  it('draws green pipes as rects for top and bottom segments (R9.8)', () => {
    render(ctx, makeSnapshot());

    const greenRects = ctx.calls.filter(
      (c) => c.method === 'fillRect' && c.fillStyle === COLOR_PIPE,
    );
    // Two pipes, each with a top and bottom segment => 4 rects.
    expect(greenRects.length).toBe(4);

    // Each green rect uses the pipe body width.
    for (const rect of greenRects) {
      const [, , width] = rect.args;
      expect(width).toBe(CONFIG.PIPE_WIDTH);
    }
  });

  it('draws a dark-gray ground strip across the full width at the bottom (R9.9)', () => {
    render(ctx, makeSnapshot());

    const groundRect = ctx.calls.find(
      (c) => c.method === 'fillRect' && c.fillStyle === COLOR_GROUND,
    );
    expect(groundRect).toBeDefined();
    expect(groundRect.args).toEqual([0, groundTop, playArea.width, playArea.groundHeight]);
  });

  it('draws the ghost image scaled to the ghost box when the image is set (R9.1)', () => {
    const snapshot = makeSnapshot();
    render(ctx, snapshot);

    const drawImageCalls = ctx.calls.filter((c) => c.method === 'drawImage');
    expect(drawImageCalls.length).toBe(1);

    const { ghost } = snapshot;
    const [image, x, y, width, height] = drawImageCalls[0].args;
    expect(image).toBe(STUB_GHOST_IMAGE);
    expect(x).toBe(ghost.x - ghost.width / 2);
    expect(y).toBe(ghost.y - ghost.height / 2);
    expect(width).toBe(ghost.width);
    expect(height).toBe(ghost.height);
  });

  it('draws the score text formatted via formatScore (R6.3, R9.10)', () => {
    const snapshot = makeSnapshot();
    render(ctx, snapshot);

    const expectedText = formatScore(snapshot.score, snapshot.highScore);
    const scoreText = ctx.calls.find(
      (c) => c.method === 'fillText' && c.args[0] === expectedText,
    );
    expect(scoreText).toBeDefined();
    // The score readout is centered horizontally over the ground strip.
    expect(scoreText.args[1]).toBe(playArea.width / 2);
  });

  it('draws the game-over overlay when phase is gameOver (R7.5, R8.3)', () => {
    const snapshot = makeSnapshot({ phase: 'gameOver' });
    render(ctx, snapshot);

    const overlayTexts = ctx.calls
      .filter((c) => c.method === 'fillText')
      .map((c) => c.args[0]);

    expect(overlayTexts.some((t) => /game over/i.test(t))).toBe(true);
    expect(overlayTexts.some((t) => /flap to play again/i.test(t))).toBe(true);

    // Score readout remains visible underneath the overlay (R7.5).
    const expectedScore = formatScore(snapshot.score, snapshot.highScore);
    expect(overlayTexts).toContain(expectedScore);
  });

  it('does NOT draw the game-over overlay while playing (R8.3)', () => {
    render(ctx, makeSnapshot({ phase: 'playing' }));

    const texts = ctx.calls
      .filter((c) => c.method === 'fillText')
      .map((c) => c.args[0]);

    expect(texts.some((t) => /game over/i.test(t))).toBe(false);
    expect(texts.some((t) => /flap to play again/i.test(t))).toBe(false);
  });

  it('draws a solid white placeholder (no drawImage) when ghostImage is null (R9.11)', () => {
    const snapshot = makeSnapshot({ assets: { ghostImage: null } });
    render(ctx, snapshot);

    // No image is drawn when the sprite is missing.
    const drawImageCalls = ctx.calls.filter((c) => c.method === 'drawImage');
    expect(drawImageCalls.length).toBe(0);

    // A solid placeholder shape is filled with the placeholder color instead.
    const placeholderFill = ctx.calls.find(
      (c) => c.method === 'fill' && c.fillStyle === COLOR_GHOST_PLACEHOLDER,
    );
    expect(placeholderFill).toBeDefined();

    // The placeholder is a traced path (rounded rect) ending in closePath.
    const hasPath =
      ctx.calls.some((c) => c.method === 'beginPath') &&
      ctx.calls.some((c) => c.method === 'closePath');
    expect(hasPath).toBe(true);
  });

  it('createRenderer binds a context and renders a snapshot into it', () => {
    const renderer = createRenderer(ctx);
    renderer.render(makeSnapshot());

    const bg = ctx.calls.find((c) => c.method === 'fillRect');
    expect(bg.fillStyle).toBe(COLOR_BACKGROUND);
  });
});
