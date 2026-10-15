# Coin feature — verification evidence (v2 fix iteration)

## Review finding addressed

The only blocking finding in `review.json` / `review.md` was **"Missing test-execution evidence"** — a process gap, not a code defect. The review explicitly confirmed that the committed diff (commits `59dc1e3` + `bccb506`) conforms to every steering rule and `scaffold-entity` skill constraint:

- `src/coin.js` is a pure, non-mutating logic module (no class), importing only `config.js` and `collision.js`, with named exports plus a matching default object.
- Four tunables (`COIN_WIDTH`, `COIN_HEIGHT`, `COIN_SPEED`, `COIN_BONUS`) live only in the frozen `CONFIG`.
- AABB-only collision via `aabbIntersect`; injected `rng`; delta-scaled motion.
- `drawCoins` in `renderer.js` is the sole canvas writer, drawn between `drawPipes` and `drawGround`.
- `gameStateManager.js` owns `world.coins`, advances/collects/culls only while playing, resets on ready/play, freezes coins in the snapshot, awards `COIN_BONUS` once per collected coin, and never triggers game-over.

No code changes were required for this iteration. The fix is supplying the recorded verification evidence below.

## Test execution

Command: `npm test` (runs `vitest --run`, single-run mode) from the repo root.

Result: **PASS**

```
Test Files  18 passed (18)
      Tests  78 passed (78)
   Duration  1.63s
   Exit Code: 0
```

### Coin-relevant files confirmed green

- `test/coin.property.test.js` — 7 tests passed (6 fast-check properties at `numRuns: 100` covering: advanceCoins non-mutation, delta-scaled leftward motion, deterministic in-bounds spawning, collect-once semantics + far-away no-collect, cull of collected/offscreen coins, AABB overlap-vs-separation).
- `test/renderer.test.js` — 12 tests passed (includes the `drawCoins` example assertions over a mocked ctx: gold arc per non-collected coin, skipped collected coins, rounded center, empty-coins case, ground drawn after the coin batch).

No pre-existing tests regressed; all 18 test files are green.
