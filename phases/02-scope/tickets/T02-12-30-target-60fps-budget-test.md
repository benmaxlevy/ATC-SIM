# T02-12 30-target 60fps budget test

**Phase:** 02 Scope
**Priority:** P1
**Size:** M
**Depends on:** T02-02, T02-03, T02-04, T02-05
**Blocks:** T02-13
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Prove (automated budget + manual GPU check) that **30 arrivals** can paint at **~60 FPS** on Canvas2D with maps, full datablocks, leaders, and history on — the architecture quality bar.

## Context

`phases/_shared/architecture.md`: “30 arrivals on scope at 60 FPS on a 2020 laptop (integrated GPU) with Canvas2D.” Phase 2 is when that bar becomes real. Do not “optimize” by deleting datablocks. Measure first.

## Research

No new STARS feature. Keep using **track** / **datablock** in the bench UI (`30 TRACKS`, not “30 planes”). Do not switch to sprites to hit 60 FPS (**R12**).

## Scope

1. **Spawn helper** (debug / scenario flag): `?traffic=30` or a `kdem-30.json` / function `spawnArrivals(world, n)` placing 30 jets on a wide downwind arc so they do not sit in one pixel. Must not be the default student scenario (keep 4–8). Document how to enable.
2. **Automated CPU budget (CI):** a Vitest test that calls `renderScope` (or the pure layout + draw) **60 times** for a world of 30 tracks with maps+history+full blocks+leaders, PTL off, on a 1280×800 canvas (node `canvas` / `OffscreenCanvas` / mocked ctx that records draw calls).
   - If a real canvas is unavailable in CI, assert **draw-call / alloc budget** instead: e.g. map Path2D built once per camera, ≤ 1 `beginPath` per track for symbol, no `JSON.parse` of KDEM inside `renderScope`, history buffers length ≤ 5.
   - Wall-time gate: if using a real canvas in Node, 60 frames in **< 2000 ms** on CI (loose; CI is not a GPU). Record the number in the test name comment.
3. **Manual FPS:** Chrome, default student machine target: 30 traffic, history on, range 20, all map layers, full datablocks, PTL on or off (run both). `rAF` measures `p50` frame dt over 5 s. Pass: **p50 ≥ 55 FPS** (dt ≤ 18.2 ms) and **min ≥ 40 FPS**. Write the numbers in a comment or `docs` is forbidden extra — put results in the ticket AC check when running T02-13, or `performance` log to the session log.
4. **Hot-path rules** (enforce with tests or lint-ish comments + one spy test):
   - Do not rebuild map JSON every frame.
   - Do not allocate a new font parse per character.
   - Do not draw history with >5 dots.
5. If the manual bar fails: profile, then cache datablock strings, reduce stroke calls, or cap shadow/blur (**there should be no blur**). Do not switch to WebGL in this phase without a new ticket.

## Out of scope

- WebGL, worker offload, culling that hides datablocks at 30 tracks, dropping history by default to “pass” without measuring, 100-target stretch goal.

## Implementation notes

`performance.now()` around `renderScope` in a `vitest` bench file `src/scope/renderScope.bench.test.ts`. Skip the wall-clock assert on machines without canvas via `describe.skipIf`.

FPS HUD: a tiny `FPS 59` in the DCB-lite or corner, **debug-only** (`?debug=fps`). Default UI stays clean.

## Acceptance criteria

- [x] **AC1 —** A documented way exists to spawn exactly 30 arrivals without changing Command IR.
- [x] **AC2 —** Automated: 30-track render runs 60 times in CI without throwing; map cache is not rebuilt 60 times (spy ≤ number of camera changes, default 1).
- [x] **AC3 —** Automated: each track’s history length ≤ 5 after long stepWorld.
- [ ] **AC4 —** **Manual:** on Chrome + integrated GPU, 30 tracks, 5 s sample, p50 ≥ 55 FPS. Record GPU/CPU in the PR or ticket note.
- [x] **AC5 —** Default scenario remains 4–8 aircraft; 30 is opt-in.
- [x] **AC6 —** No WebGL context created (`getContext('webgl')` unused).
- [x] **AC7 — Research:** Bench chrome says **tracks**, not planes/sprites.

## Notes

AC4 skip-with-reason: Chrome + integrated GPU p50 sample cannot be run while the human is asleep. Automated CI budget (AC2/AC3) ships and passes. Re-run with `?traffic=30&debug=fps` on the student machine when awake.

## Test plan

- Unit: spawn 30, history cap, map cache spy.
- Integration: render 60 frames.
- Manual: AC4 with Chrome FPS meter or in-app `?debug=fps`.

## Suggested files

- `src/scenario/spawnArrivals.ts` (or extend T01-04)
- `src/scope/renderScope.bench.test.ts`
- `src/scope/mapLayers.ts` (cache)
- `src/ui/FpsDebug.tsx` (optional, query-flag)
