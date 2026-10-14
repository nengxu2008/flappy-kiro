# Game Architecture Standards

How Flappy Kiro's modules fit together: the module boundaries, how events flow through the game, and how state is owned and transitioned. These rules keep logic deterministic and testable, and keep side effects at the edges.

## Modular Systems

**One module, one responsibility.** Each ES module does one thing and exports a small, explicit surface. Grouped by role:

- **Pure logic** — `config`, `physics`, `pipeManager`, `collision`, `score`, `background`, `storage.parseHighScore`, `format`. Side-effect-free, non-mutating, independently testable.
- **Side-effecting** — `input` (DOM), `audio` (playback), `renderer` (canvas), `storage` I/O (`localStorage`).
- **Orchestration** — `gameStateManager` (FSM + world), `gameLoop` (rAF), `main` (bootstrap + wiring).

**Dependencies point inward.** Orchestration depends on pure and side-effecting modules; pure modules depend on nothing but `config`. Never let a pure module import `renderer`, `audio`, `input`, or anything touching the DOM. If you need a value from the outside world in pure code, pass it as an argument.

**Inject dependencies; don't reach for globals.** The state manager is built via a factory that receives its collaborators, so tests can substitute fakes.

```js
// gameStateManager.js
export function createGame({ audio, storage, rng, playArea, assets }) {
  // ...owns the world, delegates math to pure modules, effects to audio/storage
  return { state, update, handleFlap, getSnapshot };
}
```

- `rng: () => [0,1)` is injected (never call `Math.random()` directly in logic) so pipe gaps and cloud layout are deterministic under test.
- `audio` and `storage` are injected so the FSM can be tested without sound or `localStorage`.

**Pure functions return new state.** No module mutates its arguments. `applyGravity`, `advancePipes`, `scorePasses`, etc. return new objects/arrays. Only the state manager holds mutable references, and it replaces them with the values returned by pure functions.

**Constants live in `config.js` only.** No magic numbers scattered across modules. `config` is frozen and is the single source of truth; every other module imports from it.

## Event Handling

**Normalize input at the edge, into one signal.** `input.js` registers `mousedown`/`click`, `touchstart`, and `keydown` (Space) listeners and collapses all of them into a single `flap` signal. The rest of the game knows only "flap," never which device produced it. Call `preventDefault` on Space so the page doesn't scroll.

**Queue events; the loop pulls them.** Listeners enqueue; they never call into the state manager directly. The game loop drains the queue once per frame via `consumeOneFlap()`, applying at most one flap per frame and discarding the rest. This decouples event timing from simulation timing and keeps updates deterministic.

```js
// Listener side: enqueue only.
function onFlapEvent(e) { e.preventDefault?.(); flapQueued = true; }

// Loop side: consume at most one per frame.
export function consumeOneFlap() {
  const f = flapQueued; flapQueued = false; return f;
}
```

**No event-driven state mutation.** DOM events must not mutate world state inside the handler. All state change happens in `update(dt)` / `handleFlap()` during the frame. This avoids mid-frame state tearing and keeps the simulation reproducible.

**Effects fire from transitions, not from listeners.** Audio and storage writes are triggered by state transitions in the manager (e.g. game-over sound on entering Game_Over), not from input callbacks.

## State Management

**A single finite state machine owns the game.** Three phases: `ready`, `playing`, `gameOver`. The `gameStateManager` is the sole owner of authoritative world state — `ghost`, `pipes[]`, `clouds[]`, `score`, `highScore`, `gameOverEnteredAt`, `playArea`, `assets`, `unsupported`. No other module stores game state.

**Transitions are explicit and centralized.**

- `ready → playing` — on first flap: reset score to 0, set ghost velocity to `FLAP_IMPULSE`.
- `playing → gameOver` — on any AABB collision: evaluate/persist high score, play game-over sound once, freeze ghost and pipes, start the 500 ms input-ignore window.
- `gameOver → ready` — on a flap after the 500 ms window: reset score, ghost position, and clear pipes. (Game Over returns to Ready, not straight to Playing — the next session's first flap starts play.)

**Per-phase update rules live in the manager.** The loop calls `update(dt)` unconditionally; the manager decides what runs:

- Clouds advance in **every** phase.
- Gravity, flap, pipe scroll/spawn/cull, scoring, and collision run **only** in `playing`.
- In `ready` the ghost is held still (`vy = 0`, no gravity).
- In `gameOver` the ghost and pipes are frozen.

**Collision math never transitions state.** `collision.js` returns booleans; only the manager, and only while in `playing`, turns a collision into a transition. The same discipline applies to scoring and high-score logic — pure functions compute, the manager commits.

**Render from an immutable snapshot.** The renderer reads `getSnapshot()` — a read-only view — and never writes back. This enforces a one-way data flow: input → update → state → snapshot → render.

**Capability flag gates everything.** If the bootstrap capability check fails, `unsupported` is set and the loop is never constructed, so no flap can ever reach `playing`.

## One-Way Data Flow (summary)

```
DOM events ─► input queue ─► loop (consume 1) ─► handleFlap()/update(dt)
                                                        │
                                 pure modules (physics, pipes, collision, score)
                                                        │
                                              state manager (owns world)
                                                        │
                                   effects (audio, storage)   snapshot
                                                                  │
                                                              renderer ─► canvas
```

Keep the arrows pointing one way. Input never writes state directly; the renderer never mutates; pure logic never reaches outward.
