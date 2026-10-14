# Project Structure

```
/
├── index.html          # Entry point: canvas, unsupported-browser message, <script type="module" src="src/main.js">
├── src/                # ES module source
├── test/               # Vitest test files (mirror src/ module names)
├── assets/             # Game media: ghosty.png, jump.wav, game_over.wav
├── img/                # Screenshots and docs images (not loaded at runtime)
├── package.json        # type: "module"; vitest + fast-check dev deps; test script
├── vitest.config.js    # jsdom test environment config
├── README.md
└── .kiro/              # Specs and steering (not shipped with the game)
```

## Module Layout (`src/`)

Each module is a small ES module with a single responsibility. Pure modules are isolated from side-effecting ones.

**Pure logic (property-tested):**

- `config.js` — frozen constants: the single source of truth for dimensions, physics, pipe, cloud, and timing values.
- `physics.js` — `applyGravity`, `applyFlap`, `integrate`. Non-mutating.
- `pipeManager.js` — `spawnPipe`, `advancePipes`, `cullOffscreen`, `needsSpawn`. Uses injectable `rng`.
- `collision.js` — `aabbIntersect`, `ghostHitsPipe`, `ghostHitsBounds`.
- `score.js` — `scorePasses`, `nextHighScore`.
- `background.js` — `advanceClouds` plus the cloud-layout factory.
- `storage.js` — pure `parseHighScore`, plus side-effecting `readHighScore` / `writeHighScore` wrapping `localStorage` in try/catch.
- `format.js` — `formatScore`.

**Side-effecting:**

- `input.js` — normalizes mouse/touch/keyboard to a single flap signal; at most one flap per frame via `consumeOneFlap()`.
- `audio.js` — preloads and plays `jump.wav` / `game_over.wav`; degrades silently when blocked.
- `renderer.js` — reads an immutable snapshot and draws to the Canvas 2D context. No mutation.

**Orchestration:**

- `gameStateManager.js` — the Ready/Playing/Game_Over FSM; owns the authoritative world and delegates math to pure modules, effects to audio/storage.
- `gameLoop.js` — the `requestAnimationFrame` loop; computes clamped delta time, drives update then render.
- `main.js` — bootstrap: capability check, async asset load with a 3 s watchdog, then wires modules and enters Ready.

## Conventions

- Test files live in `test/` and mirror the module they cover.
- The renderer is the only module that touches the canvas; the state manager is the only owner of world state.
- Reference assets by their existing paths: `assets/ghosty.png`, `assets/jump.wav`, `assets/game_over.wav`.
