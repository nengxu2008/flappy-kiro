# Product

Flappy Kiro is a single-page, browser-based arcade game — a Flappy Bird clone starring a white ghost (`assets/ghosty.png`).

## Gameplay

- The ghost falls under gravity and rises on each flap (click, tap, or Spacebar).
- Green pipes scroll right-to-left with randomized, passable gaps.
- Score increases by 1 for each pipe passed; the best score persists as a high score.
- A dark gray ground, light blue sky, and semi-transparent parallax clouds set the scene.

## Game States

The game runs as a three-state machine:

- **Ready** — ghost idle and centered, waiting for the first flap.
- **Playing** — gravity, pipes, scoring, and collision are active.
- **Game Over** — ghost and pipes freeze, overlay shows, high score persists; a flap after a 500 ms window returns to Ready.

## Design Priorities

- Zero runtime dependencies and no build step — runs by opening `index.html` or serving the folder with any static server.
- Frame-rate independent motion (delta-time scaling) targeting 60 FPS.
- Graceful degradation: missing assets, blocked audio, and unavailable storage never break gameplay. Unsupported browsers show a static message instead of a broken game.
