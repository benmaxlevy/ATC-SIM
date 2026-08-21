# T04-10 MSAW lite

**Phase:** 04 Procedures
**Priority:** P0
**Size:** M
**Depends on:** T04-01
**Blocks:** T04-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The scope warns when an aircraft is below a **floor polygon / MVA JSON**. Yellow then red. Inhibited on ILS inside FAF (on loc/GS/landing). Lite, not certified. No weather.

## Context

Glossary: MSAW phase 4 stub. Non-goals: no mosaic, no certification. Alerts are pure functions of position + catalog. KDEM field elev 0.

T04-01 is the procedure catalog; MVA may be a sibling JSON loaded with the scenario (`kdem-mva.json`) so procedure schema stays procedure-only.

## Research

Read **R01** / **R02** MSAW, **R05** MSAW parameters (policy, not our polygons).

- Search: `7110.65 MSAW minimum safe altitude warning` and `STARS MSAW FOA`
- UI: **MSAW**, not GPWS, TAWS, or “terrain alarm.”
- Comment: trainer MVA polygons; not certified MSAW.

## Scope

- Types: `MvaChart { airportId, defaultMinAltitudeFt, polygons: { id, minAltitudeFt, verticesNm: {xNm,yNm}[] }[] }`.
- KDEM chart: at least two floors (suggestion: outer box ±40 NM at 2500 ft; inner ~8 NM box/octagon at 1500 ft). Rectangles are fine. Point-in-polygon (or AABB if you only ship rectangles — document **rectangles v1** and implement `contains` accordingly).
- `msawFloorFt(x, y, chart)` = polygon with **highest** floor among those containing the point? No: **most specific**. v1: pick the polygon containing the point with the **smallest area**; if overlap, **maximum minAltitude** is safer. **Frozen rule:** overlapping polygons → use the **maximum** `minAltitudeFt` (higher floor wins). If in none, `defaultMinAltitudeFt`.
- **Yellow (caution):** `alt < floor` AND `alt >= floor - 300`.
- **Red (alert):** `alt < floor - 300`.
- **Inhibit** when `lateral` is `LOC` | `LANDING` or `vertical` is `GS`, **and** along-track to threshold `<= fafDistanceNm` (inside FAF). Heading/DIRECT/STAR/MISSED never inhibited.
- Events: `alert.msaw.caution`, `alert.msaw.alert`, `alert.msaw.clear` on edges.
- Scope tint: README priority vs CA.
- Tests: point in inner polygon at 1000 ft → alert; on GS at 5 NM at 1600 ft → no MSAW; heading at same point → MSAW.

## Out of scope

- CA (T04-09).
- Grid MVA from CIFP.
- Departure climb special cases, 1000 AGL AGL-only rules beyond polygons.
- Audio.

## Implementation notes

Even-odd or winding PIP if not AABB. Include a unit test with a clear inside/outside vertex.

Do not use radar altitude. MSL only.

If GS inhibit is hard because T04-06 is parallel: gate inhibit on `vertical === "GS" || lateral === "LOC"` **and** distance to `RW27` ≤ 6 NM even before GS exists — still correct for “on loc inside FAF.”

Constants: `MSAW_RED_BELOW_FT = 300`.

## Acceptance criteria

- [ ] **AC1 —** Given KDEM MVA JSON loaded, tests use the JSON’s actual `minAltitudeFt` values (do not hard-code 2500 in assertions unless that is the file). For a point inside a polygon with floor `F`: altitude `F - 100` → caution; altitude `F - 400` → alert.
- [ ] **AC2 —** Given position inside the inner polygon, floor 1500, alt 1400 → caution; alt 1000 → alert.
- [ ] **AC3 —** Given on LOC or GS inside 6 NM of threshold at 1200 ft (below inner floor), when inhibited, then no MSAW alert.
- [ ] **AC4 —** Given the same position/alt on `HEADING`, then MSAW fires.
- [ ] **AC5 —** Leaving the low-altitude region emits `alert.msaw.clear` once.
- [ ] **AC6 —** Automated tests AC1–AC5. DOM-free core. KDEM MVA committed.

## Test plan

- Unit: PIP/AABB; floor selection; yellow vs red; inhibit predicate.
- Integration: `stepWorld` one aircraft descending on heading in the inner box.
- Manual: T04-12 or descend someone to 1000 ft east of the field off the loc.

## Suggested files

- `src/scenario/data/kdem-mva.json`
- `src/scenario/mva/types.ts`
- `src/core/alerts/msaw.ts`
- `src/core/alerts/msaw.test.ts`
- `src/scope/` (tint reuse)
