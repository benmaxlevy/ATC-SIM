# T01-10 Crude Canvas2D PPI

**Phase:** 01 Closed loop
**Priority:** P0
**Size:** L
**Depends on:** T01-03, T01-04, T00-04 (coordinate system)
**Blocks:** T01-11, T01-12, T01-14
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The Phase 0 PPI placeholder is a north-up Canvas2D plan view: range rings, airport at origin, and each aircraft as a **dot + callsign text**. `requestAnimationFrame` **only renders**. Physics continues to run via the T01-01 accumulator + `stepWorld`.

## Context

`phases/_shared/glossary.md`: **PPI** is north-up 2D radar; distances in NM. **Track** v1 = aircraft 1:1.

`phases/_shared/architecture.md`: Canvas2D is enough; 30 targets at 60 FPS is the later quality bar (Phase 2 ticket). Phase 1 has 6 targets.

No datablocks, leader lines, maps, or STARS keys (Phase 2). IDENT flash may brighten the dot if `identUntilSimMs > simTimeMs`.

## Research

Read **R07** / **R08** for what a PPI *will* become; **R12** for what not to build now.

- Search: `STARS PPI north up range rings` — we only need north-up + rings + **temporary** callsign text.
- Call the canvas a **PPI** / **scope**, not a map or minimap. Temporary callsign is not a **datablock** (that word is phase 2).
- Do not import OSM or airplane sprites.

## Scope

## Scope

- Full-viewport (minus command line / disclaimer) `<canvas>` 2D context.
- **North up.** +y NM = up the screen; +x NM = right.
- Origin (airport ref) at canvas center.
- Default range **40 NM** from center to the nearer of half-width/half-height (fit a 40 NM radius in the smaller canvas dimension). Document the mapping: `pxPerNm = min(w, h) / (2 * rangeNm)`.
- Range rings at **10 NM** intervals (10, 20, 30, 40) plus a small airport mark at origin (cross or filled circle — not a runway map).
- Aircraft: filled circle (tick) at `(xNm, yNm)` and `callsign` text slightly offset (e.g. +8 px right, +4 px up). Font: monospace, readable on dark background (light green or white ticks on near-black — not a STARS palette spec).
- Selected aircraft (if id set) drawn **brighter or with a larger ring**; click wiring is T01-11 but the **draw path** should already branch on `world.selectedAircraftId`.
- IDENT active: pulse or extra halo; if too much, solid brighter tick is enough.
- rAF loop:
  1. Measure wall Δt (seconds)
  2. `advanceWorld(world, wallDtS, acc)`
  3. Resize canvas to device pixels (`devicePixelRatio`)
  4. Clear and draw rings, airport, tracks
- Do not call `stepWorld` with the rAF delta.
- Replace the Phase 0 empty placeholder; do not add map GeoJSON.

## Out of scope

- Datablocks, leader lines, history dots, predicted track, altitude filter, pan/zoom UI (fixed 40 NM is OK; range keys are Phase 2).
- WebGL, phosphor decay.
- Click handling (T01-11) — you may leave a stub `worldToCanvas` / `canvasToWorld` used by tests and T01-11.
- STARS color ownership.

## Implementation notes

Keep projection math in `src/scope/camera.ts` so it is testable without a real canvas:

```ts
export interface Camera {
  rangeNm: number; // 40
  centerXNm: number; // 0
  centerYNm: number; // 0
}

export function worldToCanvas(
  xNm: number,
  yNm: number,
  cam: Camera,
  cssWidth: number,
  cssHeight: number,
): { x: number; y: number };
```

North up: canvas Y increases downward, so `canvasY = cy - (yNm - centerY) * pxPerNm`.

Draw in CSS pixels after setting canvas width/height to `css * dpr` and `scale(dpr, dpr)`.

`src/scope` may read `World` but must not write `intent`. It may read `selectedAircraftId`.

If the boot path did not yet call `createWorldFromScenario`, call it here so 6 ticks appear.

Pause may still be false always until T01-12; aircraft should already drift east along heading ~080–100 (`DAL123` at 100).

## Acceptance criteria

- [ ] **AC1 —** `npm run dev`: canvas fills the scope area; background is dark; **range rings** are visible.
- [ ] **AC2 —** **6** callsigns from the default scenario are visible as text, including `DAL123`, east of center (right half of the screen given north-up and +x east).
- [ ] **AC3 —** Over a few seconds at 1x, ticks **move** (downwind-ish, generally rightward).
- [x] **AC4 —** Projection unit test: airport `(0,0)` maps to canvas center; a point at `xNm = rangeNm`, `yNm = 0` maps near the right edge midpoint (±2 px with a fixed 800×800 fixture).
- [x] **AC5 —** Physics: grep the rAF callback — it must not pass frame `dt` into `stepWorld` directly; it uses `advanceWorld` / accumulator.
- [x] **AC6 —** No datablock leader lines, no map polylines, no STARS keyboard handler.
- [ ] **AC7 —** **Manual:** no console errors while idling 10 seconds.

## Test plan

- Unit: `worldToCanvas` / `canvasToWorld` with a square viewport.
- Integration: none
- Manual: AC1–AC3, AC7

## Suggested files

- `src/scope/ppi.ts`
- `src/scope/camera.ts`
- `src/scope/camera.test.ts`
- `src/scope/draw.ts`
- `src/main.ts` — rAF loop
- `index.html` — canvas node if not already present
