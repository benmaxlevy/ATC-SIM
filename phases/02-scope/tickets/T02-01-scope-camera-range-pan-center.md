# T02-01 Scope camera range pan center

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T01-10
**Blocks:** T02-02, T02-03, T02-10, T02-11
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The PPI is a **radar camera**: discrete range 5–60 NM, view center in NM, pan without zoom-to-cursor, `Home`/`End`/wheel/PageUp/PageDown wired. Pixel math is a tested pure API used by every later layer.

## Context

Phase 1 T01-10 drew a crude north-up picture. That is a game-map smell if range is a continuous camera zoom aimed at the cursor. Terminal scopes use a **range preset** around a **center**. See `phases/02-scope/README.md` frozen decisions 3–4 and `phases/_shared/architecture.md` (`src/scope`).

Radio pipeline stays in Command IR (`phases/_shared/command-ir.md`). This ticket must not parse keystrokes as commands.

## Research

Read `phases/_shared/references.md` **R07** (CRC RANGE / CENTER), **R12** (browser ATC *anti-pattern*: cursor-zoom).

- Open: https://docs.virtualnas.net/crc/stars/ — search the page for **range** and **center**.
- Search fallback: `CRC STARS range presets center` and `STARS TCW range NM`.
- **Terms:** **range** (NM preset), **center**, **PPI**. Never **zoom**, **zoom-to-cursor**, **camera scale** in UI. Range readout is `RNG 20`, not `ZOOM 20`.
- **Trainer delta:** CRC has extra presets (6/8/12/16/24). Ours are 5–60 as in the phase README. Middle-drag pan is trainer sugar — comment `// not CRC`.
- File comment: analog CRC RANGE/CENTER; delta = PageUp/Down + wheel, no DCB RANGE menu yet.

## Scope

- Introduce `ScopeCamera` (`rangeNm`, `centerEastNm`, `centerNorthNm`) with presets `5 | 10 | 15 | 20 | 30 | 40 | 50 | 60`. Default range **20 NM**. Default center = KDEM airport reference from T00-04 / T00-05.
- Pure `nmToScreen` / `screenToNm` given canvas CSS size (use backing-store / `devicePixelRatio` correctly so 1 CSS pixel mapping is consistent).
- Range = radius of the **inscribed circle** of the drawable PPI (padding for DCB-lite comes in T02-10; for now use the full canvas). Document: corners of a square canvas sit outside range.
- **Circular clip** of the world draw (or clip test helpers). Prefer clipping draw to the range circle.
- Range in/out: `PageUp` / `PageDown` and mouse wheel over PPI. No wrap at ends.
- `Home`: center on airport ref. `End`: center on last left-click world position (or airport if none).
- Double-click empty PPI: center there.
- Middle-button drag: pan (mutate center). Trainer sugar; document in a code comment as not-CRC.
- Changing range **does not** change center. Wheel **must not** zoom toward cursor.
- Always-on: these keys `preventDefault` even when the command line is focused.
- Replace T01-10 “fit everything” or arbitrary scale with this camera. Keep click-select working (may be slightly wrong until T02-04 expands hit boxes — symbol hit-test at least).
- On-canvas or chrome range readout `RNG 20` (monospace, map-green). If chrome is easier, a tiny DOM label is OK until T02-10.

## Out of scope

- Map geometry (T02-02), datablocks, leaders, DCB-lite UI, WebGL, rotation, zoom-to-cursor, continuous range slider, CRC extra presets (6/8/12/16/24).
- Binding `R` or `C` to range/center.

## Implementation notes

```ts
export const RANGE_PRESETS_NM = [5, 10, 15, 20, 30, 40, 50, 60] as const;
export type RangeNm = (typeof RANGE_PRESETS_NM)[number];

export function nmToScreen(
  eastNm: number,
  northNm: number,
  cam: ScopeCamera,
  view: { widthPx: number; heightPx: number },
): { x: number; y: number };

export function screenToNm(
  x: number,
  y: number,
  cam: ScopeCamera,
  view: { widthPx: number; heightPx: number },
): { eastNm: number; northNm: number };
```

- Y increases downward in canvas; north is **up** on screen. Round-trip error must be ≤ 1e-6 NM in tests at center and at a corner.
- `pxPerNm = min(width, height) / 2 / rangeNm` (inscribed circle).
- Store `lastClickEastNm` / `lastClickNorthNm` on scope view, not on `World`.
- Resize: recompute pixels; do not reset center/range unless canvas size is 0.
- Tests must not require a browser if math is extracted; a jsdom canvas is OK for wiring.

## Acceptance criteria

- [ ] **AC1 —** Given default session, when the PPI paints, then range is 20 NM and the airport ref is at the canvas center (±2 px).
- [ ] **AC2 —** Given range 20, when `PageUp` (or wheel up) fires five times, then range is 5 NM and center is unchanged. Further `PageUp` leaves range at 5.
- [ ] **AC3 —** Given range 20, when `PageDown` fires until stop, then range is 60 NM, center unchanged. Further `PageDown` is a no-op.
- [ ] **AC4 —** Given a click at a world point P not the airport, when `End` fires, then P is at canvas center. When `Home` fires, airport ref is at center.
- [ ] **AC5 —** Wheel over the PPI with the cursor **not** at center does not move `centerEastNm` / `centerNorthNm` (no zoom-to-cursor).
- [ ] **AC6 —** Middle-drag moves the view center; releasing and measuring a known world point shows it translated in pixels consistent with `nmToScreen`.
- [ ] **AC7 —** With the command line focused, `PageUp` / `Home` still change camera and do **not** insert characters into the command buffer.
- [ ] **AC8 —** Automated: `nmToScreen` ↔ `screenToNm` round-trip unit tests at center, at +5 NM east, and at +5 NM north, for range 5 and 60.
- [ ] **AC9 — Research:** No user-facing string contains `zoom`. Module comment cites R07 RANGE/CENTER and the extra-preset delta.

## Test plan

- Unit: camera math, preset stepping, clamp, round-trip.
- Integration: key/wheel handlers do not call parser (spy).
- Manual: resize the window; range circle stays inscribed; readout matches.

## Suggested files

- `src/scope/camera.ts`
- `src/scope/camera.test.ts`
- `src/scope/renderScope.ts` (upgrade T01-10)
- `src/ui/ScopeCanvas.tsx` (or existing PPI host)
- `src/scope/scopeKeys.ts` (always-on Page/Home/End)
