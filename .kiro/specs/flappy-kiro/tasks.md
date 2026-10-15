# Implementation Plan: Flappy Kiro

## Overview

This plan builds Flappy Kiro incrementally as a set of vanilla JavaScript ES modules rendered with the HTML5 Canvas 2D API, with no build step. Work starts with project setup and the shared `config.js` constants module, then implements the pure-logic modules (physics, pipe management, collision, score, background, storage parsing, score formatting) together with their fast-check property-based tests mapped to the 24 design correctness properties. Side-effecting modules (input, audio, storage I/O, renderer) and the `GameStateManager` FSM follow, then the delta-time `requestAnimationFrame` loop and the `main.js` bootstrap with capability check and asset-load watchdog. Finally `index.html` wires everything together, and example/integration/rendering/timing tests cover the remaining criteria.

Each property test uses fast-check with a minimum of 100 iterations and is tagged `// Feature: flappy-kiro, Property {n}: {text}`.

## Tasks

- [x] 1. Set up project structure, tooling, and shared constants
  - [x] 1.1 Initialize project and Vitest + fast-check tooling
    - Create `package.json` with `type: "module"` and dev dependencies `vitest` and `fast-check`
    - Add a `test` script running `vitest --run` (single-run, non-watch)
    - Create `vitest.config.js` configuring the `jsdom` test environment for DOM/canvas-adjacent tests
    - Create the directory structure: `src/` for modules and `test/` for test files
    - _Requirements: 10.1_

  - [x] 1.2 Implement the `config.js` constants module
    - Create `src/config.js` exporting a frozen object with all design constants from the conversion table: `GRAVITY = 1620`, `MAX_FALL = 660`, `FLAP_IMPULSE = -480`, `PIPE_SPEED = 160`, `PIPE_SPACING = 260`, `GAP_MARGIN = 60`, `GAP_HEIGHT` factor (2.5 × ghost height), `CLOUD_SPEEDS = [20, 45]`
    - Include Play_Area dimensions (480×640 logical), `groundHeight`, ghost width/height, pipe width, cloud opacity range (0.3–0.7), the 500 ms game-over ignore window, the 3 s asset watchdog, and the max delta clamp (≈0.05 s)
    - Freeze the exported object as the single source of truth
    - _Requirements: 3.1, 3.3, 2.3, 4.1, 4.2, 4.4, 4.5, 9.3, 9.5, 9.6_

- [x] 2. Implement pure physics module
  - [x] 2.1 Implement physics functions
    - Create `src/physics.js` with pure, non-mutating `applyGravity(ghost, deltaSeconds)` (v += GRAVITY×dt, clamp to MAX_FALL), `applyFlap(ghost)` (v = FLAP_IMPULSE), and `integrate(ghost, deltaSeconds)` (y += vy×dt)
    - Each function returns a new ghost object without mutating the input
    - _Requirements: 2.3, 3.1, 3.2, 3.3_

  - [x] 2.2 Write property test for flap impulse
    - **Property 2: Flap sets a fixed upward impulse regardless of prior velocity**
    - **Validates: Requirements 2.3, 3.4**
    - Generate arbitrary `vy` values; assert `applyFlap(ghost).vy === FLAP_IMPULSE`
    - Tag: `// Feature: flappy-kiro, Property 2: Flap sets a fixed upward impulse regardless of prior velocity`

  - [x] 2.3 Write property test for gravity integration and clamp
    - **Property 5: Gravity integrates velocity and clamps to maximum fall speed**
    - **Validates: Requirements 3.1, 3.3**
    - Generate arbitrary ghosts and `dt ≥ 0`; assert downward velocity increases by GRAVITY×dt and never exceeds MAX_FALL across frame sequences
    - Tag: `// Feature: flappy-kiro, Property 5: Gravity integrates velocity and clamps to maximum fall speed`

  - [x] 2.4 Write property test for position integration
    - **Property 6: Position integrates from velocity**
    - **Validates: Requirements 3.2**
    - Generate arbitrary ghosts and `dt ≥ 0`; assert `integrate(ghost, dt).y === ghost.y + ghost.vy × dt`
    - Tag: `// Feature: flappy-kiro, Property 6: Position integrates from velocity`

- [x] 3. Implement pure pipe management core
  - [x] 3.1 Implement pipe generation and scrolling functions
    - Create `src/pipeManager.js` with pure core functions: `spawnPipe(rng, playArea, lastPipeX)` (random `gapY` within margins, fixed `gapHeight`, `x = lastPipeX + PIPE_SPACING`), `advancePipes(pipes, deltaSeconds)` (x -= PIPE_SPEED×dt), `cullOffscreen(pipes, playArea)` (drop pipes fully past left edge), and `needsSpawn(pipes, playArea)` (spacing interval reached)
    - Use an injectable `rng: () => [0,1)` for gap selection; choose gap center uniformly in `[GAP_MARGIN + GAP_HEIGHT/2, playArea.height - groundHeight - GAP_MARGIN - GAP_HEIGHT/2]`
    - All core functions are non-mutating
    - _Requirements: 4.1, 4.2, 4.4, 4.5, 4.6_

  - [x] 3.2 Write property test for pipe scrolling
    - **Property 8: Pipes scroll left at a fixed speed**
    - **Validates: Requirements 4.1**
    - Generate arbitrary pipe sets and `dt ≥ 0`; assert each pipe `x` becomes `x − PIPE_SPEED × dt`
    - Tag: `// Feature: flappy-kiro, Property 8: Pipes scroll left at a fixed speed`

  - [x] 3.3 Write property test for pipe spawn spacing
    - **Property 9: Pipe spawn spacing is constant**
    - **Validates: Requirements 4.2**
    - Generate sequences of spawned pipes; assert consecutive center-to-center distance equals PIPE_SPACING
    - Tag: `// Feature: flappy-kiro, Property 9: Pipe spawn spacing is constant`

  - [x] 3.4 Write property test for gap placement and margins
    - **Property 10: Generated gaps lie within the Play_Area with required margins**
    - **Validates: Requirements 4.4, 4.5**
    - Generate rng values in `[0,1)`; assert gap top edge ≥ GAP_MARGIN below ceiling, gap bottom edge ≥ GAP_MARGIN above ground, and gap height equals the fixed ≥ 2× ghost height value
    - Tag: `// Feature: flappy-kiro, Property 10: Generated gaps lie within the Play_Area with required margins`

  - [x] 3.5 Write property test for offscreen culling
    - **Property 11: Offscreen pipes are culled, visible pipes retained**
    - **Validates: Requirements 4.6**
    - Generate arbitrary pipe sets; assert pipes with right edge past the left edge are removed and all others retained unchanged
    - Tag: `// Feature: flappy-kiro, Property 11: Offscreen pipes are culled, visible pipes retained`

- [x] 4. Implement pure collision module
  - [x] 4.1 Implement AABB collision functions
    - Create `src/collision.js` with pure `aabbIntersect(a, b)` (standard AABB overlap), `ghostHitsPipe(ghost, pipe)` (ghost box vs derived top and bottom segment boxes), and `ghostHitsBounds(ghost, playArea)` (ceiling and ground)
    - Derive segment boxes: top from ceiling (y=0) to `gapY - gapHeight/2`, bottom from `gapY + gapHeight/2` to top of ground
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 4.2 Write property test for collision detection
    - **Property 12: Collision with any pipe, the Ground, or the Ceiling ends the game**
    - **Validates: Requirements 5.1, 5.2, 5.3**
    - Generate arbitrary ghost and world geometry; assert collision is reported if and only if ghost box overlaps a pipe segment, ghost bottom reaches/passes ground top, or ghost top reaches/passes ceiling
    - Tag: `// Feature: flappy-kiro, Property 12: Collision with any pipe, the Ground, or the Ceiling ends the game`

- [x] 5. Implement pure score and high-score logic
  - [x] 5.1 Implement scoring functions
    - Create `src/score.js` with pure `scorePasses(ghost, pipes)` returning `{ pipes', gained }` — marks each unscored pipe whose right edge is left of `ghost.x` as scored and counts it once — and `nextHighScore(score, highScore)` returning `max(score, highScore)`
    - Non-mutating; the current score stays a non-negative integer
    - _Requirements: 6.2, 6.4, 6.5, 7.1, 7.2, 7.6_

  - [x] 5.2 Write property test for per-session scoring
    - **Property 14: Each pipe scores exactly once per session**
    - **Validates: Requirements 6.2, 6.4, 6.5**
    - Generate frame sequences; assert each pipe adds at most 1, re-running `scorePasses` never re-counts a scored pipe, and the score is always a non-negative integer
    - Tag: `// Feature: flappy-kiro, Property 14: Each pipe scores exactly once per session`

  - [x] 5.3 Write property test for high-score monotonicity
    - **Property 15: High score is the running maximum and never decreases**
    - **Validates: Requirements 7.1, 7.2, 7.6**
    - Generate non-negative integer `(score, highScore)` pairs; assert `nextHighScore(s, h) === max(s, h)` and the result never decreases and stays a non-negative integer
    - Tag: `// Feature: flappy-kiro, Property 15: High score is the running maximum and never decreases`

- [x] 6. Implement pure background (parallax clouds) logic
  - [x] 6.1 Implement cloud update and layout functions
    - Create `src/background.js` with pure `advanceClouds(clouds, deltaSeconds, playArea)` (x -= speed×dt; wrap past left edge back to the right edge) and a cloud-layout factory that assigns per-cloud `speed` from `CLOUD_SPEEDS` (≥ 2 distinct, all `< PIPE_SPEED`) and `opacity` within 0.3–0.7
    - Place clouds within the background region above the ground
    - _Requirements: 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 6.2 Write property test for cloud opacity range
    - **Property 19: Cloud opacity stays within the configured range**
    - **Validates: Requirements 9.3**
    - Generate cloud sets from the layout factory; assert every opacity is within [0.3, 0.7]
    - Tag: `// Feature: flappy-kiro, Property 19: Cloud opacity stays within the configured range`

  - [x] 6.3 Write property test for cloud advance and wrap
    - **Property 20: Clouds advance and wrap in every state**
    - **Validates: Requirements 9.4, 9.7**
    - Generate clouds and `dt > 0`; assert each `x` decreases by `speed × dt` and clouds past the left edge are repositioned at or beyond the right edge
    - Tag: `// Feature: flappy-kiro, Property 20: Clouds advance and wrap in every state`

  - [x] 6.4 Write property test for distinct, slower cloud speeds
    - **Property 21: Cloud speeds are distinct and slower than pipes**
    - **Validates: Requirements 9.5, 9.6**
    - Generate cloud sets; assert at least two distinct speeds exist and every speed is strictly less than PIPE_SPEED
    - Tag: `// Feature: flappy-kiro, Property 21: Cloud speeds are distinct and slower than pipes`

- [x] 7. Implement pure storage parsing and score formatting
  - [x] 7.1 Implement `parseHighScore` and `formatScore`
    - Create `src/storage.js` with pure `parseHighScore(raw)` that maps a `string | null` raw value to a valid non-negative integer, returning 0 for `null`, non-numeric, float, negative, or oversized values
    - Create `src/format.js` with pure `formatScore(current, high)` returning `"Score: " + current + " | High: " + high`
    - _Requirements: 1.5, 1.6, 1.7, 9.10_

  - [x] 7.2 Write property test for high-score parsing
    - **Property 1: High score parsing yields a valid non-negative integer**
    - **Validates: Requirements 1.5, 1.6, 1.7**
    - Generate arbitrary raw values (null, strings, floats, negatives, oversized); assert the result is a non-negative integer, and for any non-negative integer `n`, `parseHighScore(String(n)) === n`
    - Tag: `// Feature: flappy-kiro, Property 1: High score parsing yields a valid non-negative integer`

  - [x] 7.3 Write property test for score display formatting
    - **Property 22: Score display formatting**
    - **Validates: Requirements 9.10**
    - Generate non-negative integer pairs; assert `formatScore(current, high) === "Score: " + current + " | High: " + high`
    - Tag: `// Feature: flappy-kiro, Property 22: Score display formatting`

- [x] 8. Checkpoint - Ensure pure-module tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement side-effecting storage, input, and audio modules
  - [x] 9.1 Implement storage I/O wrapping the pure parser
    - Add `readHighScore()` and `writeHighScore(value)` to `src/storage.js`, wrapping `localStorage` access in `try/catch`; `readHighScore` delegates to `parseHighScore` and returns 0 when storage is unavailable or throws; `writeHighScore` is best-effort and swallows errors, retaining the in-memory value on failure
    - When the stored value is invalid, overwrite the stored value with 0 (best-effort)
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 7.3, 7.4_

  - [x] 9.2 Write unit tests for storage I/O
    - Test `readHighScore` returns 0 when `localStorage` read throws, and that a valid stored integer round-trips
    - Test `writeHighScore` swallows a thrown write (quota/private mode) and keeps the in-memory value
    - _Requirements: 1.8, 7.4_

  - [x] 9.3 Implement InputHandler
    - Create `src/input.js` registering `mousedown`/`click`, `touchstart`, and `keydown` (Space) listeners that normalize to a single `flap` signal; enqueue at most one flap per frame and expose `consumeOneFlap()` for the loop; call `preventDefault` on Space to avoid page scroll
    - _Requirements: 2.4, 2.5_

  - [x] 9.4 Write property test for flap source equivalence
    - **Property 3: Flap input source equivalence**
    - **Validates: Requirements 2.4**
    - Generate flap events from mouse, touch, and keyboard sources; assert the normalized flap signal and resulting state change are identical across sources
    - Tag: `// Feature: flappy-kiro, Property 3: Flap input source equivalence`

  - [x] 9.5 Write property test for at-most-one-flap-per-frame
    - **Property 4: At most one flap processed per frame**
    - **Validates: Requirements 2.5**
    - Generate `N ≥ 1` queued flaps per frame; assert consuming for that frame applies exactly one flap and discards the remaining `N − 1`
    - Tag: `// Feature: flappy-kiro, Property 4: At most one flap processed per frame`

  - [x] 9.6 Implement AudioManager
    - Create `src/audio.js` that preloads `assets/jump.wav` and `assets/game_over.wav` and exposes `playFlap()` (once per flap) and `playGameOver()` (once per game over), using cloned audio nodes or `currentTime` reset so rapid flaps each produce one sound; wrap `play()` in a caught promise/try-catch to degrade silently when audio is blocked
    - _Requirements: 2.2, 8.1_

  - [x] 9.7 Write integration tests for audio playback
    - Using a mocked AudioManager, assert `playFlap` fires exactly once per flap and `playGameOver` fires exactly once per game-over transition, and that a blocked `play()` does not throw or interrupt state
    - _Requirements: 2.2, 8.1_

- [x] 10. Implement the GameStateManager FSM
  - [x] 10.1 Implement the state manager core and transitions
    - Create `src/gameStateManager.js` with `createGame(deps)` exposing `state`, `update(deltaSeconds)`, `handleFlap()`, and `getSnapshot()`; own the authoritative world (`ghost`, `pipes[]`, `clouds[]`, `score`, `highScore`, `gameOverEnteredAt`, `playArea`, `assets`, `unsupported`)
    - Wire transitions: Ready→Playing on flap (reset score to 0, set ghost velocity to FLAP_IMPULSE), Playing→Game_Over on collision (evaluate/persist high score, play game-over sound once, freeze ghost and pipes, start 500 ms ignore window), Game_Over→Ready on flap after the window (reset score, ghost position, clear pipes)
    - In Playing, run gravity, flap, pipe scroll/spawn/cull, scoring, and collision; run cloud advance in every state; hold ghost still in Ready (vy=0, no gravity)
    - Delegate math to the pure modules and effects to audio/storage
    - _Requirements: 1.4, 2.1, 2.3, 3.4, 3.5, 4.3, 5.1, 5.2, 5.3, 5.4, 6.1, 7.1, 7.5, 8.1, 8.2, 8.4, 8.5, 9.4_

  - [x] 10.2 Write property test for Ready-state stillness
    - **Property 7: Ready state holds the Ghost still**
    - **Validates: Requirements 3.5**
    - Generate delta-time sequences in Ready; assert ghost position and velocity stay at the fixed starting values (vy=0, no gravity)
    - Tag: `// Feature: flappy-kiro, Property 7: Ready state holds the Ghost still`

  - [x] 10.3 Write property test for no collisions outside Playing
    - **Property 13: No collision transitions outside the Playing_State**
    - **Validates: Requirements 5.4**
    - Generate colliding geometry while in Ready or Game_Over; assert no state transition occurs
    - Tag: `// Feature: flappy-kiro, Property 13: No collision transitions outside the Playing_State`

  - [x] 10.4 Write property test for Game_Over freeze
    - **Property 16: Game_Over freezes the Ghost and Pipes**
    - **Validates: Requirements 8.2**
    - Generate delta-time sequences in Game_Over; assert ghost position/velocity and every pipe `x` remain unchanged
    - Tag: `// Feature: flappy-kiro, Property 16: Game_Over freezes the Ghost and Pipes`

  - [x] 10.5 Write property test for the restart ignore window
    - **Property 17: Game_Over input-ignore window gates restart**
    - **Validates: Requirements 8.4**
    - Generate elapsed times since entering Game_Over; assert a flap within 500 ms produces no transition and a flap at/after 500 ms triggers the restart transition
    - Tag: `// Feature: flappy-kiro, Property 17: Game_Over input-ignore window gates restart`

  - [x] 10.6 Write property test for restart world reset
    - **Property 18: Restart resets the world and returns to Ready**
    - **Validates: Requirements 8.5**
    - Generate Game_Over states with arbitrary score, ghost position, and pipes; assert a flap after the window resets score to 0, resets ghost to start, removes all pipes, and sets phase to Ready
    - Tag: `// Feature: flappy-kiro, Property 18: Restart resets the world and returns to Ready`

- [x] 11. Implement the Renderer
  - [x] 11.1 Implement Canvas 2D rendering
    - Create `src/renderer.js` that reads an immutable snapshot and draws in order: light blue background fill, clouds at configured opacity, green pipes (top and bottom segments), dark gray ground strip spanning full width, ghost (image scaled to size, or solid placeholder shape when `assets.ghostImage === null`), score text formatted via `formatScore`, and the game-over overlay (indicator + restart prompt) when in Game_Over; perform no mutation
    - _Requirements: 1.3, 6.3, 7.5, 8.3, 9.1, 9.2, 9.8, 9.9, 9.10, 9.11_

  - [x] 11.2 Write rendering tests against a mock 2D context
    - Using a recording mock 2D context in jsdom, assert the renderer draws the blue background, clouds, green pipes, dark gray ground, ghost image at size, score text, and the game-over overlay in Game_Over
    - Assert a solid placeholder is drawn when the ghost image is null, and that at least two clouds appear within the background region
    - _Requirements: 1.3, 6.3, 7.5, 8.3, 9.1, 9.2, 9.8, 9.9, 9.11_

- [x] 12. Checkpoint - Ensure module and manager tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement the game loop and bootstrap
  - [x] 13.1 Implement the delta-time game loop
    - Create `src/gameLoop.js` driving a `requestAnimationFrame` loop: compute `deltaSeconds = (now - last)/1000` clamped to the max delta from config, consume at most one queued flap, call `update(deltaSeconds)` then `render()`, store the timestamp, and request the next frame
    - _Requirements: 2.5, 10.2, 10.4_

  - [x] 13.2 Write property test for delta-time frame-rate independence
    - **Property 23: Delta-time scaling makes motion frame-rate independent**
    - **Validates: Requirements 10.4**
    - Generate random partitions of a 1-second interval into frames; assert total ghost and pipe displacement is within 5% of the 60 FPS reference displacement
    - Tag: `// Feature: flappy-kiro, Property 23: Delta-time scaling makes motion frame-rate independent`

  - [x] 13.3 Implement main.js bootstrap with capability check and asset watchdog
    - Create `src/main.js` that verifies a 2D canvas context and `requestAnimationFrame` are available; if not, reveal a static "unsupported browser" message and never construct the loop (set `unsupported`)
    - Otherwise, asynchronously load the ghost image and two audio clips behind a 3-second watchdog so Ready is reached even if an asset is slow or fails (placeholder image, silent audio), then construct the state manager, input handler, renderer, and loop and enter Ready
    - _Requirements: 1.1, 9.11, 10.5_

  - [x] 13.4 Write property test for unsupported-browser gating
    - **Property 24: Unsupported browsers never enter Playing**
    - **Validates: Requirements 10.5**
    - Generate runs where the capability check fails; assert the game stays flagged unsupported and no flap transitions it into Playing
    - Tag: `// Feature: flappy-kiro, Property 24: Unsupported browsers never enter Playing`

- [x] 14. Wire up index.html and remaining example/integration/timing tests
  - [x] 14.1 Create index.html and wire the entry point
    - Create `index.html` with the canvas element, the hidden "unsupported browser" message element, and a `<script type="module" src="src/main.js">` entry; reference existing assets at `assets/ghosty.png`, `assets/jump.wav`, `assets/game_over.wav`
    - _Requirements: 10.1, 10.5_

  - [x] 14.2 Write example tests for Ready-state and spawn scenarios
    - Assert the ghost is horizontally and vertically centered at start and the score shows 0 in Ready; the first pipe spawns off the right edge on entering Playing; derived top/bottom segment boxes bracket the gap; the score resets to 0 at session start
    - _Requirements: 1.2, 1.4, 4.3, 4.7, 6.1_

  - [x] 14.3 Write integration/timing tests for startup and input responsiveness
    - Using a timing harness, assert Ready is reached within 3 s of load, flap-to-Playing occurs within 50 ms, and the flap impulse is applied within 50 ms; assert the unsupported-browser message path via a jsdom stub that removes the 2D context
    - _Requirements: 1.1, 2.1, 10.3, 10.5_

- [x] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; all 24 design properties and the example/integration/timing scenarios map to these sub-tasks.
- Each task references the specific requirement clauses and, where applicable, the design correctness property it implements, for full traceability.
- Property-based tests use fast-check with a minimum of 100 iterations and the `// Feature: flappy-kiro, Property {n}: {text}` tag; randomness in production code flows through an injectable `rng` so tests seed it deterministically.
- Checkpoints provide incremental validation at natural boundaries (pure modules, FSM/renderer, full wiring).
- Performance (sustained 60/≥55 FPS, R10.2) and cross-browser smoke (R10.1) require manual/perf measurement and are intentionally not coding tasks here.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1", "7.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "3.2", "3.3", "3.4", "3.5", "4.2", "5.2", "5.3", "6.2", "6.3", "6.4", "7.2", "7.3", "9.1", "9.3", "9.6"] },
    { "id": 4, "tasks": ["9.2", "9.4", "9.5", "9.7", "10.1"] },
    { "id": 5, "tasks": ["10.2", "10.3", "10.4", "10.5", "10.6", "11.1"] },
    { "id": 6, "tasks": ["11.2", "13.1"] },
    { "id": 7, "tasks": ["13.2", "13.3"] },
    { "id": 8, "tasks": ["13.4", "14.1"] },
    { "id": 9, "tasks": ["14.2", "14.3"] }
  ]
}
```
