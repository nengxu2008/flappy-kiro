---
name: scaffold-entity
description: Scaffold a new Flappy Kiro game entity following the project's steering rules — a pure, non-mutating logic module (physics + collision functions), a renderer draw helper, frozen config constants, and mirrored property + example tests. Use when the user asks to add, create, or scaffold a new game entity, actor, obstacle, pickup, or world object (e.g. a coin, enemy, powerup, moving platform).
---

# Scaffold a new game entity

This skill creates a new game entity that conforms to Flappy Kiro's architecture, coding-standards, canvas-and-rendering, structure, and tech steering rules. Read those rules before scaffolding; they override any generic habit.

## Critical constraint: entities are NOT classes with methods

The user may ask for an "entity class with physics, render, and collision methods." Do not create a single class/object that owns `physics()`, `render()`, and `collision()` methods. That violates the project's two hardest rules:

- **Factories over classes; pure logic separated from side effects.** Physics and collision are pure, non-mutating functions in a logic module. Rendering is a side effect that lives only in the renderer — the renderer is the ONLY module allowed to touch the 2D canvas context. An entity never draws itself.
- **No mutation of input state.** Pure functions return NEW objects, never mutate arguments. Only `gameStateManager.js` holds mutable references and reassigns them from pure results.

So "physics, render, and collision for an entity" maps onto the real module layout like this:

| Requested piece | Where it actually goes |
| --- | --- |
| physics / motion | pure functions in `src/<entity>.js` (e.g. `advance<Entity>s`), non-mutating, delta-scaled |
| collision | pure functions in `src/<entity>.js` or `src/collision.js` (e.g. `ghostHits<Entity>`), returning a boolean via `aabbIntersect` |
| render | a draw helper added to `src/renderer.js`, reading the immutable snapshot; the entity module has no draw code |

Explain this mapping to the user when you scaffold — do not silently produce something different from the literal request.

## Steps

1. **Get the entity name.** Ask the user (or infer from the request) a singular `camelCase` entity name, e.g. `coin`, `enemy`, `movingPlatform`. Derive:
   - module file: `src/<entity>.js` (camelCase matching the primary export)
   - test file: `test/<entity>.property.test.js` (mirrors the module)
   - factory/function names: `createX`, verb functions `advance<Entity>s`, predicate `ghostHits<Entity>` / `<x>IsOffscreen`
   - plain data shape documented with JSDoc; fields `camelCase`; units suffixed when ambiguous (`deltaSeconds`, velocities px/s, upward negative)

2. **Add constants to `config.js` only.** Any tunable value (speed, size, spawn interval, spacing) goes into the frozen `CONFIG` object as `UPPER_SNAKE_CASE` per-second rates, with a comment citing the range/reason. Never hard-code a magic number in the entity module. Read the existing `config.js` and append to the frozen object, keeping it `Object.freeze`d and freezing any nested arrays/objects with `[...spread]`.

3. **Create the pure logic module** `src/<entity>.js` from `references/entity-module-template.js`. Rules:
   - Side-effect-free. Imports only `config.js` (and `collision.js` for `aabbIntersect` if needed). Never import `renderer`, `audio`, `input`, or anything DOM.
   - Every function returns new objects/arrays; never mutates inputs.
   - Randomness flows through an injected `rng: () => [0,1)`; time flows in as `deltaSeconds`. Never call `Math.random()` or read the clock.
   - Motion is per-second constants from `CONFIG` scaled by `deltaSeconds`; hoist the per-frame `dx` out of any `map`.
   - Collision is AABB only (`aabbIntersect`, four comparisons) — no distance/trig, no broad-phase. Use the shared box convention: `{ left, top, right, bottom }` with `top < bottom`, center-origin entities deriving `left = x - width/2` etc.
   - Prefer a single traversal when advancing/culling/marking a collection; avoid chained `map`/`filter` that build throwaway intermediate arrays in the hot path.
   - Named exports plus a `default` object of the same functions, matching the existing modules.

4. **Add the render helper to `renderer.js`** from `references/renderer-helper-template.js`. Rules:
   - It reads fields off the immutable snapshot and only issues draw calls; it mutates nothing.
   - Round sprite destination coordinates to integers (`Math.round`) to avoid sub-pixel blur.
   - Wrap any `globalAlpha`/`fillStyle`/transform change for this entity in `ctx.save()`/`ctx.restore()`; batch draws that share state.
   - Insert the call in the fixed back-to-front draw order: sky → clouds → pipes → ground → ghost → score → overlay. Place the new entity at the correct depth (ask the user if ambiguous).
   - Do not load assets in the draw path; assets are preloaded at bootstrap.

5. **Wire the entity into `gameStateManager.js` (only if the user wants it live).** The state manager owns the mutable world array (`world.<entity>s`), advances it in the correct phase (clouds-style every-phase, or playing-only like pipes), reassigns it from the pure results, and includes it in `getSnapshot()` as frozen data. Do not put entity state anywhere else. Keep `getSnapshot()` from re-wrapping already-frozen config.

6. **Create mirrored tests** `test/<entity>.property.test.js` from `references/entity-property-test-template.js`:
   - Property-based with fast-check, minimum 100 runs, each property tagged `// Feature: flappy-kiro, Property {n}: {text}`.
   - Cover: non-mutation (input unchanged after each call), delta scaling (distance ∝ deltaSeconds), determinism under a seeded `rng`, and collision correctness (overlap ⇒ true, separation ⇒ false).
   - The side-effecting renderer helper gets example-based assertions with a mocked `ctx`, not property tests — add those to the existing `test/renderer.test.js` style if rendering was added.

7. **Run the suite** with `npm test` (which runs `vitest --run`, single-run, never watch) and fix any failures before reporting done. Confirm the new module and tests pass and nothing else regressed.

## Reference files

- `references/entity-module-template.js` — the pure logic module skeleton (physics + collision), fully commented with the placeholders to replace.
- `references/renderer-helper-template.js` — the renderer draw helper skeleton.
- `references/entity-property-test-template.js` — the fast-check property test skeleton.

Replace every `__Entity__` / `__entity__` / `__ENTITY__` placeholder (PascalCase / camelCase / UPPER_SNAKE) and fill in the shape-specific fields. Delete any section the specific entity does not need (e.g. an immobile entity needs no `advance` function).
