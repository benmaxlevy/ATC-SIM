# T04-09 Conflict alert lite

**Phase:** 04 Procedures
**Priority:** P0
**Size:** M
**Depends on:** none (phase 1 `World` / tracks)
**Blocks:** T04-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The scope warns when two aircraft are in conflict: **pair closer than 3 NM and less than 1000 ft vertical** — **yellow** when that is predicted, **red** when it is happening now. Lite, not NAS-certified. No ARV, no CRDA.

## Context

Glossary: CA / MSAW are phase 4 stubs. Architecture: tracks 1:1 with aircraft, no sensor error. Phase 2 reserved yellow/red. Phase 5 will score `alert.ca.*` from the session log (T00-08). Non-goals: no certification claim; no weather.

## Research

Read **R01** safety alerts, **R05** Conflict Alert, **R02** conflict alert.

- Open FOA STARS: https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap12_section_6.html — CA.
- Search: `7110.65 conflict alert` and `STARS CA 3 NM 1000 ft`
- UI: **CA** / **conflict alert**, never TCAS. Do not label “STARS CA.” Comment: lite 3 NM / 1000 ft trainer, not NAS parameters.

## Scope

- Pure `evaluateConflictAlert(aircraft[]): CaAlert[]` called from `stepWorld` (or 5 Hz if documented; tests call it directly).
- **Red (`alert`):** current 2D distance `< 3.0 NM` AND `|ΔaltFt| < 1000`.
- **Yellow (`caution`):** not red, but linear lookahead `T = 40 s` (constant ground velocity, constant VS) **would** satisfy the red predicate at some sample `t ∈ (0, T]` (sample every 1 s).
- Pair uniqueness: undirected `{a,b}` sorted by callsign. Ignore self. n=30 is O(n²) — fine.
- World stores active CA set; emit `alert.ca.caution`, `alert.ca.alert`, `alert.ca.clear` on edges only (no per-tick spam).
- Scope: both targets and datablocks use caution/alert color. Priority vs ownership: see phase README (`CA alert > …`). Optional “CA” text in the block.
- UI disclaimer unchanged (training/entertainment). Do not label “STARS CA.”
- Constants exported: `CA_LATERAL_NM = 3`, `CA_VERTICAL_FT = 1000`, `CA_LOOKAHEAD_S = 40`.

## Out of scope

- ARV, CRDA, MSAW (T04-10), weather, fusion errors, predicted **resolution**.
- Audio horn (P2).
- Different IFR/VFR minima, runway occupancy.
- Inhibiting CA on final (do **not** inhibit; two aircraft on the same ILS should CA — that is the training point).

## Implementation notes

Distance: planar NM in the tangent plane (`hypot(dx, dy)`). Do not use great-circle unless phase 0 positions are lat/lon *and* you already have `nmBetween`; stay consistent.

Lookahead: `p(t) = p0 + v_ground * t`, `alt(t) = alt0 + vs * t`. VS from current climb rate (ft/s). If an aircraft is turning, linear is still the lite model — document it.

Hysteresis (optional, 0.1 NM / 50 ft) to avoid flicker; if you add it, tests use clearly inside/outside values.

Scope must not compute CA; it only reads `world.alerts`.

## Acceptance criteria

- [ ] **AC1 —** Given two aircraft 2.0 NM apart, Δalt 200 ft, when evaluated, then the pair is **red** (`alert`).
- [ ] **AC2 —** Given two aircraft 8 NM apart on colliding tracks at 250 kt, co-altitude, predicted to be `< 3 NM` inside 40 s, when evaluated, then the pair is **yellow** (`caution`) and not red.
- [ ] **AC3 —** Given two aircraft 10 NM apart, parallel, co-altitude, never inside 3 NM in 40 s, then no CA.
- [ ] **AC4 —** Given a red pair that then diverges to 5 NM / 2000 ft, when evaluated, then `alert.ca.clear` is logged and colors return to non-CA.
- [ ] **AC5 —** Scope: Manual or component test — two overlapping targets show yellow then red (if Canvas is hard to assert, a unit test on the color-priority helper plus Manual in T04-12 is OK). Prefer a small function `datablockAlertTint(track)` tested in AC5 automated.
- [ ] **AC6 —** Automated tests for AC1–AC4 and the tint helper. DOM-free for core.

## Test plan

- Unit: red / caution / none / clear edge; three aircraft → two pairs.
- Integration: `stepWorld` closes two spawns; events fire once per edge.
- Manual: T04-12 script includes a CA pair (or this ticket’s optional 20 s watch).

## Suggested files

- `src/core/alerts/conflictAlert.ts`
- `src/core/alerts/conflictAlert.test.ts`
- `src/core/alerts/colors.ts`
- `src/scope/` (apply tint)
- `src/core/events` (types for `alert.ca.*`)
