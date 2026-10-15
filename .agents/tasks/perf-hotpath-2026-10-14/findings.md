# Flappy Kiro — Per-Frame Hot-Path Performance Findings

**Scope:** read-only analysis of the per-frame hot path. No code was changed.
**Date:** 2026-10-14
**Modules analyzed:** `src/physics.js`, `src/pipeManager.js`, `src/gameLoop.js`, `src/gameStateManager.js`.
**Context modules read:** `src/collision.js`, `src/score.js`, `src/config.js`, `src/renderer.js`, `src/background.js`.

File→module mapping used (per the brief):
- *Ghosty.js* → `physics.js` + the ghost state in `gameStateManager.js`
- *Wall.js* → `pipeManager.js`
- *GameEngine.js* → `gameLoop.js` + `gameStateManager.js`

---

## Summary answer (highest-impact first)

The hot path is clean overall and respects the project's constraints: delta time is clamped, exactly one flap is consumed per frame, AABB collision is four comparisons, offscreen pipes are culled, and all simulation math is non-mutating. Nothing here is a correctness or frame-budget emergency at the game's scale (a handful of pipes and 4 clouds).

The real, concrete reductions in *extra* garbage/work beyond the intended new-state return, in priority order:

1. **`gameStateManager.update()` iterates the pipe array five separate times per Playing frame** (advance → needsSpawn → spawn-reduce → cull → score → collision `.some`), building several throwaway intermediate arrays. This is the single biggest per-frame allocation/iteration cluster. *(Medium impact — hot path, but the pipe set is tiny.)*
2. **Redundant double max-scan of pipes on spawn frames.** `needsSpawn()` scans all pipes with a `reduce` to find the max x, then `update()` immediately does a *second* `reduce` over the same array to recompute essentially the same max. One of the two is pure waste on every spawn frame. *(Low–medium impact — hot path, but only on spawn frames.)*
3. **`getSnapshot()` allocates and deep-freezes a brand-new object graph every frame in all phases** (new outer object, new frozen ghost, a `.map` of new+frozen pipe objects, a `.map` of new+frozen cloud objects, a new frozen playArea). In Ready/Game_Over the pipe/cloud data is not changing, yet the snapshot is rebuilt and re-frozen each frame. *(Low–medium impact — hot path, every frame, every phase.)*
4. **`needsSpawn()` uses `-Infinity` seed + full reduce when it only needs the newest pipe.** Minor; folds into finding 2. *(Low impact.)*

Everything in `physics.js`, `collision.js`, `score.js`, and the `gameLoop.js` `tick()` is already at or near optimal for this game and should be left alone (details in "Already optimal" below).

---

## Evidence, by module

### `gameLoop.js` — loop hygiene is correct; no per-frame allocation in `tick()`

- **Delta clamping confirmed.** `tick()` computes `rawDelta = (current - lastTimestamp) / 1000`, guards against negative skew (`safeDelta`), then clamps with `Math.min(safeDelta, CONFIG.MAX_DELTA_SECONDS)` (`MAX_DELTA_SECONDS = 0.05`). First tick seeds the timestamp with `deltaSeconds = 0`. This matches R10.4 exactly. ✔
- **At most one flap per frame confirmed.** `if (input.consumeOneFlap()) { game.handleFlap(); }` — a single boolean drain per frame, extra queued flaps discarded by `consumeOneFlap`. Matches R2.5. ✔
- **No per-frame allocation in `tick()`.** It calls `now()`, does arithmetic into locals, and calls `requestFrame(tick)` passing the existing `tick` reference (not a new closure). No object/array/closure is created per frame. ✔
- The only closures created in this module are in `resolveDefaultRequestFrame()` / `resolveDefaultNow()`, which run **once at setup (cold path)**. Leave as-is.

**Verdict:** `gameLoop.js` is optimal for the target. No change recommended.

---

### `physics.js` — pure, minimal, optimal

- `applyGravity`, `applyFlap`, `integrate` each return exactly one new ghost object via `{ ...ghost, ... }`. That single allocation per call is the *intended* non-mutating new-state return — it must stay (constraint: do not break non-mutating purity).
- No intermediate arrays, no closures, no repeated config lookups beyond the necessary `CONFIG.GRAVITY` / `CONFIG.MAX_FALL` / `CONFIG.FLAP_IMPULSE` reads (frozen constants, effectively free).
- `update()` calls `applyGravity` then `integrate` as two sequential returns (two ghost allocations/frame while Playing). These *could* be fused into a single new-object computation, but that would (a) break the one-function-one-responsibility split the steering rules require, (b) merge two property-tested pure functions, and (c) save one tiny object per frame. **Not worth it** — readability/architecture cost outweighs the sub-microsecond gain.

**Verdict:** optimal. Leave alone.

---

### `pipeManager.js` — correct and non-mutating; one redundant scan folds into the manager

Each function is non-mutating and returns new state as intended:

- `advancePipes` (line ~70): `pipes.map((pipe) => ({ ...pipe, x: pipe.x - dx }))`. One new array + N new pipe objects. **Intended** new-state return — keep. `dx` is correctly hoisted out of the map.
- `cullOffscreen` (line ~85): `pipes.filter((pipe) => pipe.x + pipe.width / 2 > 0)`. Retains survivors by reference (no new pipe objects), builds one new array. Correct and cheap. The unused `playArea` parameter is harmless.
- `needsSpawn` (line ~103): early-returns `true` on empty; otherwise `pipes.reduce((max, pipe) => Math.max(max, pipe.x), -Infinity)` to find the right-most pipe, then compares to `playArea.width - PIPE_SPACING`.
- `spawnPipe`: pure, allocates one pipe object (intended).

**Finding 2 (redundant double scan).** In `gameStateManager.update()` the spawn branch is:

```js
if (needsSpawn(world.pipes, playArea)) {          // reduce #1: scans all pipes for max x
  const lastPipeX = world.pipes.reduce(            // reduce #2: scans all pipes for max x AGAIN
    (max, pipe) => Math.max(max, pipe.x),
    playArea.width,
  );
  world.pipes = [...world.pipes, spawnPipe(rng, playArea, lastPipeX)];
}
```

On any frame where a pipe spawns, the array is scanned **twice** to compute the same right-most x (the only difference is the seed: `-Infinity` vs `playArea.width`). The second `reduce` is redundant with the work `needsSpawn` just did.

- **Optimization:** have `needsSpawn` return (or expose) the right-most pipe x it already computed, or compute `lastPipeX` once in the manager and pass it in — so the max is scanned once per spawn frame instead of twice. Because pipes are appended in increasing x and advanced uniformly, the right-most pipe is always the **last element** (`world.pipes[world.pipes.length - 1]`), so both reduces can be replaced by an O(1) last-element read, eliminating the scan entirely.
- **Impact:** low–medium. Only fires on spawn frames (one every ~`PIPE_SPACING / PIPE_SPEED` ≈ 2.9 s), and the pipe array is tiny, so wall-clock savings are small — but it removes a genuinely redundant full traversal and is a clean readability win.
- **Constraint check:** stays non-mutating; no broad-phase introduced; AABB untouched. The "last element is right-most" assumption is already relied on implicitly by the spawn ordering (`spawnPipe` places new pipes at `lastPipeX + PIPE_SPACING`), so reading the last element is safe and even more correct than a float-max reduce. ✔

---

### `gameStateManager.js` — the main concentration of per-frame work

#### Finding 1 — five sequential passes over `world.pipes` per Playing frame

`update()`'s Playing branch runs the pipe array through, in order:

```js
world.pipes = advancePipes(world.pipes, dt);        // pass 1: map  -> new array + N new objects
if (needsSpawn(world.pipes, playArea)) {             // pass 2: reduce (max x)
  const lastPipeX = world.pipes.reduce(...);         // pass 3: reduce (max x, redundant — finding 2)
  world.pipes = [...world.pipes, spawnPipe(...)];    //         spread -> another new array
}
world.pipes = cullOffscreen(world.pipes, playArea);  // pass 4: filter -> new array
const { pipes: scoredPipes, gained } =
  scorePasses(world.ghost, world.pipes);             // pass 5: map  -> new array (+ new objs for scored)
world.pipes = scoredPipes;
...
const hitPipe = world.pipes.some((pipe) =>           // pass 6: some -> no allocation, but another traversal
  ghostHitsPipe(world.ghost, pipe, playArea));
```

So on a non-spawn frame the pipe array is walked four times (advance, needsSpawn, cull, score) plus the collision `.some`, each of the first four building a fresh intermediate array that is immediately discarded by the next step. On spawn frames it is six walks plus two array literals.

- **Observation:** advance, cull, and score could in principle be fused into a *single* traversal that produces one new array (shift x, drop if offscreen, flip `scored` and count gains in the same pass). That would cut three intermediate arrays to one per frame and reduce four traversals to one, which is exactly the "prefer one pass over chained iteration" guidance in the coding-standards steering.
- **Impact:** medium *in principle*, low *in practice at this scale*. With `PIPE_SPACING = 350` and a 480-wide play area, only ~2–3 pipes are ever live, so the intermediate arrays are 2–3 elements. The allocation and iteration cost is real but small. This is the highest-value target only because it is the densest cluster, not because it threatens 60 FPS.
- **Recommended framing:** this is a *readability-vs-allocation* trade. The current chained form is very readable and each step is independently property-tested. A single fused pass would need its own tests and would blur the pure-module boundaries (advance/cull/score currently live in separate pure modules). **Recommendation:** do **not** fuse the pure modules; instead, the cheapest safe win is finding 2 (kill the redundant scan) and finding 3 (skip snapshot rebuilds), which recover most of the benefit without collapsing the tested module boundaries. Only pursue full single-pass fusion if a profiler on a low-end target shows pipe handling as a measured hot spot (the steering rule: "measure before optimizing further").
- **Constraint check:** any fusion must remain non-mutating (return new arrays/objects) and must not add a broad-phase. The collision `.some` must stay — it is the required per-pipe AABB test; it allocates nothing and is already minimal. ✔

#### Finding 3 — `getSnapshot()` rebuilds and deep-freezes the whole world every frame, in every phase

```js
function getSnapshot() {
  return Object.freeze({
    phase: world.phase,
    ghost: Object.freeze({ ...world.ghost }),
    pipes: Object.freeze(world.pipes.map((pipe) => Object.freeze({ ...pipe }))),
    clouds: Object.freeze(world.clouds.map((cloud) => Object.freeze({ ...cloud }))),
    ...
    playArea: Object.freeze({ ...world.playArea }),
    ...
  });
}
```

Called once per frame by the loop (`renderer.render(game.getSnapshot())`). Each call allocates:
- a new outer object + `Object.freeze`,
- a new frozen ghost (spread copy),
- a new array from `pipes.map`, each element a new frozen spread copy,
- a new array from `clouds.map`, each element a new frozen spread copy,
- a new frozen `playArea` copy (though `world.playArea` is already `CONFIG.playArea`, itself already frozen and never mutated).

- **Observations / candidates to reduce:**
  - `playArea` is `CONFIG.playArea`, which is already frozen and never mutated by the manager. Re-spreading + re-freezing it every frame produces one throwaway object per frame for zero benefit — the snapshot could expose `world.playArea` directly (it is already immutable).
  - In **Ready** and **Game_Over**, `world.pipes` and (for Game_Over) the pipe/ghost data are frozen/unchanging, yet the full map+freeze runs every frame. Clouds *do* advance in all phases (R9.4), so the cloud array genuinely changes each frame and must be re-snapshotted — but pipes/ghost in non-Playing phases are static between frames.
  - The per-element `Object.freeze` inside the maps is defensive deep-freezing. It guarantees the renderer cannot mutate state, which the architecture rules explicitly want ("renderer reads an immutable snapshot and never writes back"). That guarantee has a real per-frame cost (N+M freezes/frame).
- **Optimization options (in order of safety):**
  1. **Stop re-wrapping `playArea`:** reference the already-frozen `world.playArea` directly in the snapshot instead of `Object.freeze({ ...world.playArea })`. Removes one allocation/frame with no loss of immutability. Safe, trivial.
  2. **Reuse the previous frame's pipe snapshot when `world.pipes` is unchanged** (e.g., when not Playing, or when the array reference is identical to last frame). Since `advancePipes`/`cullOffscreen`/`scorePasses` only replace `world.pipes` while Playing, a reference check lets Ready/Game_Over reuse the last frozen pipe array. Modest win, slightly more code.
  3. **Relax deep-freezing to shallow** (freeze only the outer object/arrays, not every element) if profiling shows the per-element `Object.freeze` is hot. This weakens the renderer-cannot-mutate guarantee, so it should only be done with a measurement justifying it and with the renderer's read-only contract still enforced by review/tests. Not recommended without data.
- **Impact:** low–medium. Runs every frame in every phase, so it is the most *frequent* allocation site, but each snapshot is small (2–3 pipes, 4 clouds, 1 ghost). Option 1 is a clean, zero-risk reduction; option 2 is a reasonable follow-up; option 3 is measurement-gated.
- **Constraint check:** options 1 and 2 preserve full immutability (they reuse already-frozen objects); no broad-phase; non-mutating purity untouched. ✔

#### Other `gameStateManager.js` notes

- `update()` first line `const dt = Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;` — scalar locals only, no allocation. Fine.
- `advanceClouds(world.clouds, dt, playArea)` runs every frame in every phase (required by R9.4). It `map`s to a new array of new cloud objects — intended non-mutating return; 4 clouds, negligible. Keep.
- Transition functions (`startPlaying`, `endGame`, `resetToReady`, `handleFlap`) run only on events, not per frame → cold path. No action.
- `world` is a single long-lived object whose fields are reassigned from pure results — exactly the "only the state manager holds mutable references" pattern the architecture rules require. Correct.

---

## Already optimal — leave alone

- **`gameLoop.tick()`** — correct clamping, one-flap-per-frame, zero per-frame allocation. (Finding: confirmed, no change.)
- **`physics.js`** — minimal single-object returns; fusing would break the tested pure-module split for a sub-microsecond gain.
- **`collision.js`** — `aabbIntersect` is four comparisons; `ghostHitsPipe` builds two small box literals per pipe (necessary geometry, not throwaway garbage); `ghostHitsBounds` is two comparisons. No square roots, no trig, no broad-phase — exactly as the constraints mandate. The `.some` over pipes in `update()` is the required per-pipe test and allocates nothing. **Do not** add a spatial hash/quadtree (explicitly premature: ghost x is fixed, pipes are culled).
- **`score.js`** — `scorePasses` is a single `map` that returns unchanged pipes by reference when not newly scored and new objects only for the ones that flip; `gained` counted in the same pass. Already single-pass and non-mutating.
- **`config.js`** — frozen constants, read directly; no per-frame recomputation. Correct single source of truth.
- **`renderer.js`** — batches `fillStyle` for pipes (set once before the loop), uses `save`/`restore` only around alpha changes (clouds) and text; reads the snapshot without mutating. One opportunistic note below, not a hot-path defect.

---

## Minor / optional (not hot-path-critical)

- **`renderer.js` sprite coordinate rounding (R / steering):** `drawGhost` passes `left`/`top` straight to `ctx.drawImage` without rounding to integers. The canvas-and-rendering steering recommends snapping sprite destinations to integers to avoid sub-pixel smoothing/blur. This is a *rendering-quality* note, not an allocation issue, and has negligible perf effect — mentioned only for completeness.
- **`renderer.js` cloud `traceRoundedRect`** rebuilds a path per cloud per frame (4 clouds). Unavoidable for immediate-mode canvas and trivially cheap; leave as-is.

---

## Prioritized recommendation list

1. **Remove the redundant max-scan on spawn frames (Finding 2).** Replace both `reduce` calls with the O(1) last-element read (`world.pipes[world.pipes.length - 1].x`), since pipes are always appended in increasing x. Cleanest, safest win; also improves correctness clarity. *Non-mutating, no broad-phase.*
2. **Stop re-wrapping the already-frozen `playArea` in `getSnapshot()` (Finding 3, option 1).** Reference `world.playArea` directly. Zero-risk allocation removal every frame.
3. **Reuse the pipe snapshot when `world.pipes` is unchanged (Finding 3, option 2).** Low-risk reduction for Ready/Game_Over frames.
4. **(Measurement-gated) Consider a single fused advance/cull/score pass over pipes (Finding 1)** only if a profiler on a low-end 60 FPS target flags pipe handling. Keep the pure-module boundaries unless data justifies collapsing them.
5. **Do NOT** fuse `applyGravity`/`integrate`, relax snapshot deep-freezing without data, round-trip through new data structures, or add any broad-phase — each either violates a constraint or trades tested clarity for an unmeasured, negligible gain.

**Bottom line:** the hot path already honors every stated constraint and is comfortably within the 60 FPS budget at this game's entity counts. The only genuinely redundant work is the double pipe-scan on spawn frames (Finding 2) and the per-frame re-wrapping of immutable data in `getSnapshot()` (Finding 3, option 1); both are safe, small, readability-neutral-or-positive fixes. All larger restructurings should wait for a measurement, per the project's own "measure before optimizing further" rule.
