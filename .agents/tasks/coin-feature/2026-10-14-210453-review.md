# Collectible Coin entity for bonus points (v3)

Adds a `Coin` collectible that Ghosty grabs through pipe gaps for bonus points: a pure logic module (`src/coin.js`) with create/advance/collect/cull/collision functions, four frozen config constants, a gold-disc renderer helper, state-manager wiring that spawns one coin per pipe centered on the gap, and mirrored property + renderer tests. Code-level conformance to the steering rules and the `scaffold-entity` skill was already confirmed in v2 and is unchanged.

This is the third review pass. The single blocking finding from v2 — missing test-execution evidence — is now resolved. The coder supplied a `report.md` recording `npm test` (`vitest --run`) at **18 test files / 78 tests passed, exit code 0**, naming `test/coin.property.test.js` (7 tests: six fast-check properties at `numRuns: 100`) and the `test/renderer.test.js` coin additions (12 tests) as green, with no regressions.

Watch for: nothing blocking (**confirmed**). Every diff-verifiable checklist item holds and the previously-absent verification evidence is now present and consistent with the diff.

**Verdict**: APPROVED

## High-level view

Code conformance is strong across every checklist item and was verified from the diff. `src/coin.js` is side-effect-free: `createCoin`, `createCoinAt`, `advanceCoins`, `collectCoins`, `cullCoins`, and `ghostHitsCoin` each read inputs and return new objects, arrays, or booleans without mutating arguments. It imports only `config.js` and `collision.js`, with named exports plus a matching default object — no class.

All four tunables (`COIN_WIDTH`, `COIN_HEIGHT`, `COIN_SPEED`, `COIN_BONUS`) live only in `config.js` as commented `UPPER_SNAKE_CASE` members of the still-frozen `CONFIG`. Collision is AABB-only through `aabbIntersect` on center-origin boxes — no distance math, trig, or broad-phase. Randomness enters through the injected `rng`; time enters as `deltaSeconds` and scales motion via a hoisted `dx`.

The renderer's `drawCoins` is read-only, rounds coordinates, sets `fillStyle` once, wraps the batch in save/restore, and sits between `drawPipes` and `drawGround`. The state manager advances coins only while playing, resets `world.coins` to `[]` on both `resetToReady` and `startPlaying`, freezes them in the snapshot mirroring the pipes line, awards `COIN_BONUS` per newly collected coin exactly once, culls collected coins, and never lets a coin cause game-over.

The one gap that held v2 at CHANGES_REQUESTED was process, not code: no recorded test-pass evidence existed and the reviewer was told not to run the suite. The coder's `report.md` now closes that gap with a concrete pass count tied to the two coin-relevant test files, so there are no blocking findings remaining.

<details>
<summary>Issues (0)</summary>

No blocking findings. The v2 finding (missing test-execution evidence) is resolved by the coder's recorded `npm test` output.

</details>

<details>
<summary>Details</summary>

### Verification evidence (now present)

The v2 blocking finding was the absence of the coder's recorded test run. `report.md` in the task tree now supplies it: `npm test` → `vitest --run`, **Test Files 18 passed (18), Tests 78 passed (78)**, duration 1.63s, exit code 0. It names the coin-relevant files as green — `test/coin.property.test.js` (7 tests: the six fast-check properties plus the far-away no-collect example) and `test/renderer.test.js` (12 tests including the `drawCoins` example assertions) — and states no pre-existing tests regressed. This evidence is consistent with the committed diff, so the finding is cleared without re-running the suite.

### Checklist conformance (verified from the diff)

Every structural checklist item holds in the committed diff (commits `59dc1e3` + `bccb506`):

- **No class / pure, non-mutating.** `src/coin.js` is only functions; `advanceCoins` returns `{ ...coin, x: coin.x - dx }`, `collectCoins` returns a new array (new objects where a flip occurred, same reference otherwise), `cullCoins` filters, `createCoin`/`createCoinAt` build fresh literals. None writes to an argument. Imports are `config.js` and `collision.js` only. Named exports plus a `default` object of the same six, matching `pipeManager.js`/`score.js`.
- **Constants in config only.** `COIN_WIDTH`, `COIN_HEIGHT`, `COIN_SPEED`, `COIN_BONUS` are commented `UPPER_SNAKE_CASE` members of the still-`Object.freeze`d `CONFIG`. The only bare numbers in `coin.js` are `2` (half-extent divisor) and `0` (offscreen/degenerate-span floor) — structural geometry, not tunables. `COIN_SPEED` is a per-second rate scaled by delta.
- **AABB-only collision.** `ghostHitsCoin` builds center-origin boxes via `boxOf` and defers to `aabbIntersect` — four comparisons, no distance/trig, no broad-phase.
- **Injected rng / delta-scaled time.** `createCoin` draws its y from the injected `rng`; `advanceCoins` hoists `dx = CONFIG.COIN_SPEED * deltaSeconds` out of the map. No `Math.random()` or clock reads in logic.
- **Renderer sole canvas owner.** `drawCoins` reads the snapshot, skips `collected` coins, rounds `cx`/`cy`, sets `fillStyle` once, wraps in `save`/`restore`, and is called after `drawPipes` and before `drawGround`; mutates nothing.
- **Phase gating / freezing.** `world.coins` is reset to `[]` in `resetToReady` and `startPlaying`; advance/collect/cull run only in the playing branch; the snapshot freezes coins as a line-for-line mirror of the pipes line without otherwise changing the freezing pattern.
- **Scoring once / no game-over.** `collectCoins` mirrors `scorePasses`, flips overlapped uncollected coins once (re-running collects nothing), the manager adds `CONFIG.COIN_BONUS * coinsGained` then culls collected coins; the coin path is separate from `ghostHitsPipe`/`ghostHitsBounds` and never transitions phase.

### Tests (present in the diff, confirmed green by the report)

`test/coin.property.test.js` adds six fast-check properties, each tagged `// Feature: flappy-kiro, Property {n}: {text}` (Properties 1–6) and run with `RUNS = { numRuns: 100 }`: non-mutation of `advanceCoins`, delta-scaled leftward motion, deterministic in-bounds spawning, collect-once semantics (plus a far-away no-collect case), cull of collected/offscreen coins by reference, and AABB overlap-vs-separation. The non-mutation properties use `structuredClone` to preserve `-0`, matching the `bccb506` fix note on signed-zero failures. `test/renderer.test.js` gains example assertions over a recording mock `ctx` covering the gold `arc` per non-collected coin, skipped collected coins, radius/rounded center, the empty-coins case, and the ground still drawing after the coin batch. All six required properties and the renderer examples are covered, and the coder's recorded run confirms they pass.

</details>

<details>
<summary>File map</summary>

- `src/coin.js` — new pure module: create/createCoinAt/advance/collect/cull/AABB-collision for coins; named + default exports.
- `src/config.js` — adds frozen `COIN_WIDTH`, `COIN_HEIGHT`, `COIN_SPEED`, `COIN_BONUS`.
- `src/gameStateManager.js` — owns `world.coins`; spawns one coin per pipe at the gap via `createCoinAt`; advances/collects/culls while playing; resets on ready/play; freezes coins in snapshot; awards `COIN_BONUS`.
- `src/renderer.js` — adds `drawCoins` gold-disc helper; inserts call between pipes and ground; adds `COLOR_COIN`.
- `test/coin.property.test.js` — new; six tagged fast-check properties at 100 runs.
- `test/renderer.test.js` — adds coin draw example assertions and an empty-coins case.

Full diff: `git diff fbff239 HEAD` (commits 59dc1e3 + bccb506). Verification evidence: `.agents/tasks/coin-feature/report.md`.

</details>
