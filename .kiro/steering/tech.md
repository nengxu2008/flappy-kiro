# Tech Stack

## Runtime

- **Language:** Vanilla JavaScript, native ES modules (`type: "module"`).
- **Rendering:** HTML5 Canvas 2D API (immediate-mode, per-frame drawing).
- **Loop:** Single `requestAnimationFrame` loop with delta-time-scaled motion.
- **Storage:** `localStorage` for the high score.
- **No framework, no bundler, no build step.** The game ships as static files and runs by opening `index.html` directly or serving the folder.

## Testing

- **Test runner:** [Vitest](https://vitest.dev/) in a `jsdom` environment (for DOM/canvas-adjacent tests).
- **Property-based testing:** [fast-check](https://fast-check.dev/) — the standard JS PBT library. Do not hand-roll property testing.
- Pure logic modules carry property-based tests; side-effecting modules (renderer, audio, input, storage I/O) use mocks and example assertions.
- Property tests run a minimum of 100 iterations and are tagged `// Feature: flappy-kiro, Property {n}: {text}`.

## Conventions

- **Separate pure logic from side effects.** Physics, pipe management, collision, scoring, background, storage parsing, and score formatting are pure, non-mutating functions. Rendering, audio, DOM input, and `localStorage` I/O are isolated in side-effecting modules.
- **No mutation of input state.** Pure functions return new objects rather than mutating arguments.
- **Single source of truth for constants.** All tunable values live in a frozen `config.js`. Store motion rates per second and scale by delta time each frame.
- **Injectable randomness.** Randomness (pipe gaps, cloud layout) flows through an injectable `rng: () => [0,1)` so tests can seed it deterministically.
- **Fixed logical coordinate space** (480×640), origin top-left, Y increases downward, upward velocity is negative.
- **Degrade gracefully.** Wrap `localStorage` and audio `play()` in try/catch; fall back to placeholders when assets fail.

## Common Commands

```bash
# Install dev dependencies (vitest, fast-check)
npm install

# Run the full test suite once (non-watch)
npm test            # runs: vitest --run

# Run the game locally — no build step; serve the folder with any static server
npx serve .
# or simply open index.html in a browser
```

Always use `vitest --run` (single-run) rather than watch mode in automation.
