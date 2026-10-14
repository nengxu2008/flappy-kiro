# Canvas, Animation, and Collision

Patterns for the Canvas 2D rendering, the `requestAnimationFrame` loop, and collision detection in Flappy Kiro. These keep motion frame-rate independent, rendering cheap, and collision logic pure and testable.

## Canvas API Patterns

**Fixed logical resolution.** The game simulates in a fixed logical space (480×640). Set the canvas backing store to that size and let CSS scale the display. Never bake physics constants to the on-screen pixel size.

```js
// Backing store = logical size; CSS controls display size.
canvas.width = PLAY_AREA.width;   // 480
canvas.height = PLAY_AREA.height; // 640
```

**Account for devicePixelRatio for crisp output.** When scaling for high-DPI, multiply the backing store by `devicePixelRatio` and scale the context once, rather than passing fractional coordinates everywhere.

```js
const dpr = window.devicePixelRatio || 1;
canvas.width = PLAY_AREA.width * dpr;
canvas.height = PLAY_AREA.height * dpr;
ctx.scale(dpr, dpr); // draw in logical units from here on
```

**Immediate-mode, clear-and-redraw each frame.** The renderer reads an immutable snapshot and repaints the whole scene every frame. Draw back-to-front in a fixed order: sky fill → clouds → pipes → ground → ghost → score text → game-over overlay.

**Renderer is read-only.** The renderer must not mutate world state. It takes a snapshot from the state manager and only issues draw calls. World mutation belongs to the state manager; the canvas belongs to the renderer. No other module touches the 2D context.

**Save/restore around state changes.** Any time you change `globalAlpha`, `fillStyle`, transforms, or clipping for a subset of drawing (e.g. semi-transparent clouds), wrap it:

```js
ctx.save();
ctx.globalAlpha = cloud.opacity; // 0.3–0.7
ctx.drawImage(cloudImg, cloud.x, cloud.y, cloud.width, cloud.height);
ctx.restore(); // alpha back to 1 for everything else
```

**Snap sprite coordinates to integers.** Fractional `drawImage` destinations trigger sub-pixel smoothing and blur. Round destination x/y when drawing sprites.

**Image smoothing.** Set `ctx.imageSmoothingEnabled` deliberately (off for pixel-art look, on for smooth scaling) once after acquiring the context, not per frame.

**Guard the context.** Acquire the 2D context once at bootstrap. If `getContext('2d')` or `requestAnimationFrame` is unavailable, show the static unsupported-browser message and never construct the loop.

## Animation Frame Handling

**One `requestAnimationFrame` loop drives everything.** No `setInterval`, no per-entity timers. Each tick: compute delta → consume input → `update(dt)` → `render()` → store timestamp → request next frame.

**Delta-time scaling, clamped.** Express all motion as units-per-second and multiply by the measured frame delta so a 55 FPS and a 60 FPS machine travel the same distance per wall-clock second. Clamp the delta to avoid a physics "teleport" after a tab is backgrounded or the thread stalls.

```js
function tick(now) {
  let dt = (now - last) / 1000;           // seconds
  dt = Math.min(dt, MAX_DELTA);           // clamp (~0.05s / 20 FPS floor)
  last = now;

  game.handleFlap(input.consumeOneFlap()); // at most one flap per frame
  game.update(dt);
  renderer.render(game.getSnapshot());
  rafId = requestAnimationFrame(tick);
}
rafId = requestAnimationFrame(tick);
```

**At most one flap per frame.** Input listeners enqueue flaps; the loop consumes exactly one per frame and discards the rest. Keep input normalization (mouse/touch/keyboard → single flap signal) out of the loop.

**Clouds advance in every state; gravity/pipes/scoring only in Playing.** The state manager decides what updates per phase — the loop just calls `update(dt)` unconditionally.

**Store the raf id and support teardown.** Keep the id from `requestAnimationFrame` so the loop can be cancelled; never start a second concurrent loop.

**Keep per-frame work allocation-free where practical.** The loop runs ~60×/second. Avoid creating closures, arrays, or objects inside `update`/`render` hot paths that you could hoist or reuse.

## Collision Detection

**Axis-aligned bounding box (AABB) only.** All entities are rectangles in the logical space, so collision is a pure overlap test — cheap and exact enough for this game. No circle/polygon math needed.

```js
// Pure, non-mutating. a/b are { left, top, right, bottom }.
export function aabbIntersect(a, b) {
  return a.left < b.right &&
         a.right > b.left &&
         a.top < b.bottom &&
         a.bottom > b.top;
}
```

**Collision functions are pure.** `aabbIntersect`, `ghostHitsPipe`, and `ghostHitsBounds` take plain geometry and return booleans — no world state, no globals, no mutation. This keeps them property-testable (see the fast-check properties in the design).

**Derive pipe segment boxes from the gap.** A pipe is two boxes derived from `gapY` and `gapHeight`: the top segment runs from the ceiling (`y=0`) to `gapY - gapHeight/2`; the bottom runs from `gapY + gapHeight/2` to the top of the ground. Test the ghost box against both.

**Bounds are separate from pipes.** `ghostHitsBounds` checks the ghost's top edge against the ceiling and its bottom edge against the ground top. Collision ends the game only in the Playing state — the state manager gates this; collision math never transitions state itself.

**Only test what can collide.** The ghost's x is fixed, so only pipes near the ghost's x can intersect it. Culling offscreen pipes keeps the active set tiny; a full broad-phase (spatial hash/quadtree) is unnecessary here — do not add one.

**Consistent box convention.** Pick one bounding-box convention (center-origin or top-left) and use it everywhere. Document which, and derive AABB edges the same way for every entity.
