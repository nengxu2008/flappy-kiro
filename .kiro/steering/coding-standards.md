# Coding Standards

JavaScript conventions for Flappy Kiro: the patterns we favor, how we name things, and how we keep the per-frame hot path fast. These sit on top of the architecture rules (pure vs. side-effecting split, dependency injection, single FSM).

## JavaScript Game Patterns

**Factories over classes.** The game favors factory functions returning plain objects with closures over `class` syntax. This matches the module design (`createGame(deps)`) and keeps dependency injection and testing simple.

```js
export function createGame({ audio, storage, rng, playArea, assets }) {
  let state = 'ready';
  function update(dt) { /* ... */ }
  function handleFlap(flapped) { /* ... */ }
  function getSnapshot() { /* immutable view */ }
  return { get state() { return state; }, update, handleFlap, getSnapshot };
}
```

Use a `class` only when there's a clear reason (multiple instances with shared prototype methods). This game has single instances, so factories are the default.

**Pure functions for simulation; side effects at the edges.** Physics, pipes, collision, scoring, and formatting are pure and non-mutating — they take state and return new state. DOM, audio, canvas, and `localStorage` live in dedicated modules. Never mix the two in one function.

**Return new state, never mutate inputs.** Pure functions produce new objects/arrays. Only the state manager holds mutable references and reassigns them from pure results.

```js
// Good: non-mutating.
export function applyFlap(ghost) {
  return { ...ghost, vy: FLAP_IMPULSE };
}
```

**Plain data objects.** World entities (ghost, pipe, cloud) are plain object literals, not class instances. Keep shapes flat and documented with JSDoc.

**Injectable randomness and time.** Never call `Math.random()` or read the clock inside logic. Randomness flows through an injected `rng: () => [0,1)`; time flows in as the `deltaSeconds` argument. This keeps logic deterministic and property-testable.

**ES modules with named exports.** Prefer named exports; reserve default exports for a module's single primary entry (e.g. a factory) when it reads clearly. Keep each module's export surface small and explicit.

**Fail soft at the boundaries.** Wrap `localStorage` and audio `play()` in try/catch and degrade gracefully (return 0, play silence). Logic modules assume valid inputs; boundary modules sanitize.

## Naming Conventions

- **Modules / files:** `camelCase.js` matching the primary export — `gameStateManager.js`, `pipeManager.js`, `config.js`.
- **Factory functions:** `createX` — `createGame`, `createInputHandler`, `createRenderer`.
- **Classes (when used):** `PascalCase` nouns — `AudioManager`, `GameLoop`. Instances are `camelCase` (`audioManager`).
- **Functions / methods:** `camelCase` verbs describing the action — `applyGravity`, `advancePipes`, `cullOffscreen`, `scorePasses`, `consumeOneFlap`.
- **Boolean predicates:** phrased as questions — `needsSpawn`, `aabbIntersect`, `ghostHitsPipe`, `isUnsupported`. Boolean fields read as states — `scored`, `unsupported`.
- **Constants:** `UPPER_SNAKE_CASE` for the frozen config values — `GRAVITY`, `MAX_FALL`, `FLAP_IMPULSE`, `PIPE_SPEED`, `PIPE_SPACING`, `GAP_MARGIN`, `GAP_HEIGHT`, `CLOUD_SPEEDS`.
- **State phases:** lowercase string literals — `'ready'`, `'playing'`, `'gameOver'`.
- **Variables / fields:** `camelCase` — `deltaSeconds`, `gapY`, `gapHeight`, `highScore`, `gameOverEnteredAt`.
- **Units in names when ambiguous:** suffix with the unit — `deltaSeconds` not `delta`; velocities documented as px/s. Upward velocity is negative (canvas convention).
- **Private module state:** plain `let`/`const` inside the module/closure; no leading-underscore hack needed since it isn't exported.

## Performance Optimization

The loop runs ~60×/second, so the `update` and `render` paths are hot. Optimize there; don't micro-optimize cold setup code.

**Minimize per-frame allocation.** Avoid creating closures, temporary arrays, or throwaway objects inside hot loops. Hoist constants and reusable scratch values out of the per-frame path. Note: non-mutating purity still means allocating new state each frame — that's intended; the thing to avoid is *extra* garbage beyond that (e.g. `map`/`filter` chains that build intermediate arrays when one pass would do).

**Keep the active entity set small.** Cull offscreen pipes each frame so collision and rendering only touch what's on screen. The ghost's x is fixed, so no broad-phase structure (quadtree/spatial hash) is warranted — adding one would be premature.

**Clamp delta time.** Cap `deltaSeconds` (~0.05s) so a stalled or backgrounded tab doesn't cause a huge physics step and a frame-time spike on resume.

**Cheap collision math.** AABB overlap is four comparisons — no square roots, no trig. Keep it that way; don't reach for distance-based tests.

**Canvas draw efficiency.**
- Batch state changes: group draws that share `fillStyle`/`globalAlpha` so you set them once, and `save`/`restore` only around the subset that needs a different state.
- Round sprite destination coordinates to integers to avoid sub-pixel smoothing cost and blur.
- Set `imageSmoothingEnabled` once, not per frame.
- Preload the ghost image and audio at bootstrap; never load assets inside the loop.

**Prefer one pass over chained iteration.** When advancing, culling, and score-marking pipes, favor a single traversal over several `map`/`filter` passes if it stays readable.

**Measure before optimizing further.** The game targets a sustained 60 FPS (≥55 acceptable). Treat that as the bar; profile with the browser's performance tools before adding complexity, and keep readability unless a measurement justifies the trade.
