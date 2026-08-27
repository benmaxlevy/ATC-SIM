# T02-45 ATPA cone geometry and rendering

**Phase:** 02 Scope (TPA / ATPA addendum)
**Priority:** P0
**Size:** L
**Depends on:** T02-44
**Blocks:** T02-47, T02-48
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Render ATPA cones from the `world.alerts.atpa` pair set produced by T02-44, in the correct color per status, with the correct supersession order.

Replace the `shouldPaintAtpaGeometry()` stub in `src/scope/tpa.ts`, which currently hardcodes `false`. Nothing is paired here — this ticket only draws what T02-44 already computed.

## Context

`syncConflictAlerts` is the read model: the scope never recomputes geometry. T02-44 writes `world.alerts.atpa: AtpaPair[]` (`trailingCallsign`, `leadingCallsign`, `volumeId`, `distanceNm`, `requiredNm`, `closureKt`, `status`). `drawAtpaCones` walks that array the same way `drawTpaRings` walks `aircraftForTpaRings`.

`drawTpaRings` (~line 667 of `src/scope/renderScope.ts`) already sits in the track band after PTL and before targets (`drawTracks` ~line 507). It currently calls `void shouldPaintAtpaGeometry(view.atpa.on)` and paints nothing extra. Cones join that same band: world-NM polyline → `nmToScreen` → `tracePolyline` (~line 109) → `ctx.stroke()`. Never a sprite, never `ctx.fill()`.

T02-28 shipped J-rings and left ATPA as a stored toggle. `tpa.test.ts` AC3/AC6 assert the stub (`shouldPaintAtpaGeometry` is `false`, comments say "no cones" / "paints nothing"). Those assertions must be rewritten when the stub dies: ATPA-on with an **empty** pair set still paints no extra stroke; a non-empty pair set paints cones.

## Frozen cone grammar (R07)

Read **R07** `docs.virtualnas.net/crc/stars` — "TPA J-Rings and Cones" and "ATPA (Automatic Terminal Proximity Alert)". These facts are frozen:

- The cone is a wedge whose **vertex is coincident with the center of the trailing track's target symbol**, oriented from the trailing track **toward its leading track**.
- Cone **length equals the required in-trail minimum** for that pair (`requiredNm` from T02-44). Non-whole values display in tenths (T02-46 draws the digits; this ticket still uses the full `requiredNm` as length, including `2.5`).
- **Monitor** cone paints in the TPA color (blue on the TCW — `PALETTE.tools`). **Warning** cone paints caution yellow (`PALETTE.caution`). **Alert** cone paints ATPA alert orange (new `PALETTE.atpaAlert`).
- **Supersession:** Alert supersedes all other ATPA and TPA cones. Warning supersedes a manual TPA cone and the Monitor cone, but is not shown when an Alert cone is shown. Monitor is the base state.

## Visual — from R07 Fig 36–39

Fig 36 (TPA J-Rings), Fig 37 (TPA Cones), Fig 38 (Warning Cone), and Fig 39 (Alert Cone) actually show:

- Cones are **very narrow unfilled wedges** — a few degrees of half-angle — that read as **needles, not pie slices**. The far end is capped **flat** so the outline closes (vertex + two long sides + end-cap).
- Mileage digits are small, **alongside the cone body**, in the cone's own color. **This ticket does not draw them** (T02-46).
- J-rings are thin **unfilled circles** with the radius digits **inside the ring at its lower-left**. J-ring stroke already exists; this ticket does not add ring digits and does **not** suppress J-rings.
- Everything is **stroked**. Nothing is filled.

**Fig 39 discrepancy (do not guess):** the figure appears to show a **blue cone and an orange cone anchored at the same target pointing opposite ways**, which reads against the prose rule that an Alert cone "will supersede all other ATPA and TPA Cones." This ticket implements the **prose** rule (one ATPA cone per trailing track — the highest status only) and records the figure as a known discrepancy in the module comment. Do not invent a second-cone rule to match the screenshot.

## Research

Read **R07** `docs.virtualnas.net/crc/stars` — "TPA J-Rings and Cones", Monitor Cone, Warning Cone, Alert Cone.

- Search: `STARS ATPA cone wedge trailing track TPA color`
- **Terms:** ATPA cone, monitor, warning, alert, supersede, TPA cone. Not CA halo, not TCAS, not DRI.
- Comment: 45 s / 24 s are T02-44's status engine; this ticket only maps status → color. Fig 39 vs prose is recorded, not resolved by drawing both.

## Scope

- New pure module `src/scope/atpaCone.ts` (no canvas). Mirror `tpaRingPoints` in `src/scope/tpa.ts`:
  - `atpaConePoints(trailingEastNm, trailingNorthNm, leadingEastNm, leadingNorthNm, lengthNm)` — closed world-NM polyline. Vertex at the trailing target, axis along the bearing to the leader, `lengthNm` long, named small half-angle constant (about **2–4°**, so the wedge is a needle at typical RANGE), **flat end cap**. Repeat the vertex at the end the same way `tpaRingPoints` repeats its first point.
  - `atpaConeColor(status)` — `"monitor"` → `PALETTE.tools`, `"warning"` → `PALETTE.caution`, `"alert"` → `PALETTE.atpaAlert`. Never `PALETTE.alert` (CA/MSAW red).
  - `atpaSuppressesManualTpaCone(status)` — `true` for `"warning"` and `"alert"`. T02-48 consults this; this ticket owns the predicate and tests it. J-rings are not cones and are never suppressed.
  - Named constant for the half-angle. Tests pin it; do not sprinkle a magic number in the draw path.
- `PALETTE.atpaAlert` in `src/scope/palette.ts`: a distinct **orange** (suggested trainer analog `#FF8800`). R07 names the color, not the RGB. The new key must **not** disturb existing CA/MSAW palette roles: `PALETTE.alert` stays `#FF0000`, `PALETTE.caution` stays `#FFFF00`, `alertTintPaintColor` / MSAW yellow-then-red stay as they are. Monitor reuses `PALETTE.tools`; warning reuses `PALETTE.caution`.
- `drawAtpaCones` in `src/scope/renderScope.ts`, called from the same band as `drawTpaRings` (after PTL, before targets). For each painted pair: resolve trailing and leading aircraft by callsign, `atpaConePoints` → `nmToScreen` → `tracePolyline` → `ctx.stroke()` with `TPA_STROKE_PX`. World NM geometry, never a sprite. Stroke only — never fill the wedge.
- Replace `shouldPaintAtpaGeometry` with real gating: master `view.atpa.on` **plus** per-track enable/inhibit flags. The flags themselves are wired by T02-47 (DCB) and T02-49 (`*AE`/`*AI` warning+alert, `*BE`/`*BI` monitor); this ticket **accepts them as inputs and defaults them on**. Suggested home: `TrackDisplay.atpaMonitorEnabled` and `atpaWarningAlertEnabled`, both default `true`. A pair paints only when the master is on and the flag for that status is enabled. Expand the stub's `(_atpaOn: boolean): false` signature; do not leave a hardcoded `false`.
- Suppression of a **manual TPA cone** on a track that is currently showing a warning or alert cone — via `atpaSuppressesManualTpaCone`. Manual `*P` drawing is T02-48; do not draw `*P` cones here.

Each pair produces **one** cone, at the **trailing** track only. The frontmost track (no pair) draws nothing. A track that is a leader in one pair and a trailer in another draws only the cone for the pair where it is trailing.

## Out of scope

- Datablock in-trail distance readout and cone mileage text (T02-46 owns text).
- DCB TPA/ATPA cells (T02-47).
- Manual `*P` cones (T02-48) — only the suppression predicate.
- Any change to conflict alert (T04-09). Still no 3 NM CA halo.
- Reading `wakeCategory`. Length is `requiredNm` from the pair, already basic radar only.

## Implementation notes

Keep `atpaConePoints` / `atpaConeColor` / `atpaSuppressesManualTpaCone` / `shouldPaintAtpaGeometry` allocation-light and canvas-free. `drawAtpaCones` may only read `world.alerts.atpa` and look up aircraft by callsign.

Rewrite `tpa.ts` / `renderScope.ts` header comments that still say ATPA paints nothing. Rewrite `tpa.test.ts` AC3 so ATPA-on + empty `world.alerts.atpa` still equals the off stroke count; rewrite AC6 so it no longer requires the "no cones" / "paints nothing" stub wording.

World is `+x` east, `+y` north; bearing to the leader is `atan2(leadEast - trailEast, leadNorth - trailNorth)` in the same convention as `tpaRingPoints` (`sin` east, `cos` north). End-cap width is `2 * lengthNm * tan(halfAngle)` — small enough to read as a needle.

## Trainer deltas

Single TCP, so there is no per-position "adapted to display" matrix — every painted pair is visible on this TCW. No TDW white monitor variant. No aural ATPA tone.

## Acceptance criteria

- [ ] **AC1 —** `atpaConePoints` vertex is coincident with the trailing track's target (`nmToScreen` of the vertex matches `nmToScreen` of the trailer). The axis points at the leader. At a known camera, a 3 NM cone's axial length in pixels is `3 * pxPerNm` (± a small epsilon for the flat cap).
- [ ] **AC2 —** Cone length equals the pair's `requiredNm`: 3 NM when the pair carries 3, 2.5 NM when it carries 2.5. Length is read from the pair, not a literal in the draw path.
- [ ] **AC3 —** Monitor strokes `PALETTE.tools`, warning strokes `PALETTE.caution`, alert strokes `PALETTE.atpaAlert`. `PALETTE.alert` remains `#FF0000` and is not used for ATPA. Existing `palette.test.ts` CA/MSAW assertions stay green.
- [ ] **AC4 —** Supersession: a trailing track with status `alert` paints only the orange cone (no monitor, no warning). Status `warning` paints only yellow. Status `monitor` is the base state (blue). `atpaSuppressesManualTpaCone` is true for warning and alert, false for monitor.
- [ ] **AC5 —** `shouldPaintAtpaGeometry` is false when the master ATPA toggle is off (no cones, even if pairs exist). Flags default on: with the toggle on and a pair present, the cone paints. Inhibiting the monitor flag drops a monitor cone; inhibiting warning/alert drops those statuses. Empty `world.alerts.atpa` still produces no extra stroke.
- [ ] **AC6 —** No CA 3 NM halo (existing T04-09 / `tpa.test.ts` CA assertions stay). Existing J-ring tests in `tpa.test.ts` stay green. Cones are stroked, never filled.
- [ ] **AC7 — Research:** `atpaCone.ts` comment names R07 "TPA J-Rings and Cones" and the ATPA cone sections, states the prose supersession rule, and records the Fig 39 discrepancy (blue and orange cones at the same target pointing opposite ways) as known, not implemented.

## Test plan

- Unit: `src/scope/atpaCone.test.ts` — vertex, bearing, length vs `requiredNm` (3 and 2.5), half-angle constant / needle width, closed polyline, color mapper, suppression predicate, gating defaults and inhibit.
- Unit: extend `src/scope/tpa.test.ts` — rewrite stub AC3/AC6; J-rings and CA-halo tests still green.
- Unit: `src/scope/palette.test.ts` — `PALETTE.atpaAlert` exists and is not `#FF0000`; `PALETTE.alert` / `PALETTE.caution` unchanged.
- Render: mock-canvas stroke capture in `atpaCone.test.ts` or `renderScope` — three status colors, no `fill` of the wedge, camera scale.
- `npm test`.

## Suggested files

- `src/scope/atpaCone.ts` (new)
- `src/scope/atpaCone.test.ts` (new)
- `src/scope/tpa.ts`
- `src/scope/tpa.test.ts`
- `src/scope/renderScope.ts`
- `src/scope/palette.ts`
- `src/scope/palette.test.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/index.ts`
