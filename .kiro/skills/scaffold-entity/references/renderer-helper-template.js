/**
 * renderer-helper-template.js — draw helper for a new __Entity__.
 *
 * This code belongs INSIDE src/renderer.js, not in the entity module. The
 * renderer is the only module that touches the 2D context. This helper reads an
 * immutable snapshot and only issues draw calls — it mutates nothing.
 *
 * Call draw__Entity__s from the renderer's main render() in the fixed
 * back-to-front order:
 *   sky → clouds → [__entity__ if it sits here] → pipes → ground →
 *   [__entity__ if it sits here] → ghost → score → overlay
 * Place the call at the correct depth for this entity.
 */

/**
 * Draw every __Entity__ from the snapshot. Sprite destinations are rounded to
 * integers to avoid sub-pixel smoothing/blur. State changes (alpha / fillStyle)
 * are batched and wrapped in save/restore so they don't leak into later draws.
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {ReadonlyArray<{ x: number, y: number, width: number, height: number }>} entities
 * @param {HTMLImageElement | null} sprite  Preloaded image, or null to fall back to a rect.
 */
function draw__Entity__s(ctx, entities, sprite) {
  if (entities.length === 0) return;

  ctx.save();
  // If this entity needs a shared non-default state (e.g. a fill color for the
  // fallback rect), set it once here before the loop so it is not re-set per
  // element. Remove this block if the entity uses only drawImage.
  ctx.fillStyle = '#ffcc00';

  for (const entity of entities) {
    // Round center-origin position to an integer top-left destination.
    const left = Math.round(entity.x - entity.width / 2);
    const top = Math.round(entity.y - entity.height / 2);

    if (sprite) {
      ctx.drawImage(sprite, left, top, entity.width, entity.height);
    } else {
      // Graceful fallback when the asset failed to load.
      ctx.fillRect(left, top, entity.width, entity.height);
    }
  }

  ctx.restore(); // restore alpha/fillStyle for everything drawn afterward.
}

export { draw__Entity__s };
