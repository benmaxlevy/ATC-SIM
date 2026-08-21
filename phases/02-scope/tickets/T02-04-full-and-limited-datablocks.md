# T02-04 Full and limited datablocks

**Phase:** 02 Scope
**Priority:** P0
**Size:** L
**Depends on:** T02-03
**Blocks:** T02-05, T02-06, T02-08
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Every in-filter track can show a **full** or **limited datablock** in monospace: callsign, altitude (Mode C + assigned if different), ground speed. Temporary T01-10 callsign labels go away.

## Context

Glossary **datablock** (`phases/_shared/glossary.md`). Format is frozen in `phases/02-scope/README.md` decision 7. Leaders attach in T02-05; this ticket may draw the block at a default L8 offset (north, 24 px) so text is readable before T02-05, or at a placeholder offset documented as default L8.

Font: IBM Plex Mono or system monospace stack — **not** a STARS licensed face (`phases/_shared/non-goals.md`).

Altitude units: feet MSL stored; **display hundreds**. Speed: knots. Mode C = current kinematics altitude. Assigned = intent altitude from phase 1.

## Research

Read **R02** (PCG: datablock, Mode C), **R05** (display data / Mode C), **R07** (full vs limited data block).

- Open: https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/ — search **data block** / **Mode C**.
- Open: https://docs.virtualnas.net/crc/stars/ — FDB / LDB field layout.
- Search: `STARS full data block limited Mode C hundreds ground speed CRC`
- **Terms:** **full datablock**, **limited datablock**, **Mode C**, **assigned altitude**, **ground speed**. Never label, nametag, tooltip, “height.”
- v1 is **not** a field-by-field STARS clone (no scratchpad, beacon, CSI). Comment the delta. Altitude on the block is **hundreds of feet**, as on STARS/CRC, not raw feet.

## Scope

- `formatFullDatablock(track, opts): { line1: string; line2: string }`
- `formatLimitedDatablock(track): { line1: string }` → Mode C hundreds only, 3 digits.
- Full default for all tracks.
- `T` when **scope-focused**: toggle full ↔ limited on the **selected** track; if none selected, toggle **all**.
- `M` when **scope-focused**: toggle Mode C field on **full** blocks globally (README decision 7).
- Draw with `textAlign = "left"`, `textBaseline = "top"`, fill = current track color (unowned white until T02-08).
- Remove crude callsign-only labels from T01-10 / T02-03 temp.
- Ground speed: use kinematics GS (TAS=IAS in v1). Round to nearest knot, pad to 3 (`090` if ever slow — v1 jets are 150+).
- Mode C hundreds: `Math.round(altFt / 100)`, clamp display to `000`–`999` for safety; v1 envelope is 1000–18000 ft.
- Assigned shown iff `|assignedFt - modeCFt| >= 100`. Field order: `modeC  assigned  gs` when different; `modeC  gs` when same.
- Character cell: measure `0` width once; line 2 columns should align across tracks as much as a fixed font allows.
- Hit-test: clicking the datablock rectangle selects the track (same as T01-11).

## Out of scope

- Leader direction keypad (T02-05) — use default L8 offset constant shared with T02-05 if possible (`DEFAULT_LEADER_DIR = 8`).
- Scratchpad, beacon code, CSI, third line, charsize menu, auto-offset overlapping blocks.
- Showing altitude in raw feet (`3200`) instead of hundreds.

## Implementation notes

Examples:

| Condition | Full line 2 |
| --- | --- |
| 3000 ft, assigned 3000, 210 kt | `030  210` |
| 3250 ft → 033 hundreds if round, assigned 3000, 210 kt | `033  030  210` |
| Mode C hidden, assigned = Mode C, 210 kt | `210` (GS only) |
| Mode C hidden, assigned 4000, Mode C 3200, 210 kt | `040  210` |

Limited is always `033`-style Mode C even if `M` hid Mode C on full blocks (limited *is* Mode C). If that feels odd, still freeze: **limited ignores `M`**.

Parser/`T20L` must still work in radio focus: `T` as datablock toggle is **scope-focus only**.

## Acceptance criteria

- [ ] **AC1 —** Automated: formatter fixtures for same-alt, different-alt, rounding 3250 ft, GS 210.
- [ ] **AC2 —** Given a visible arrival, full block shows callsign on line 1 and hundreds + GS on line 2, monospace, not proportional.
- [ ] **AC3 —** When assigned altitude changes via a phase 1 `C`/`D`/`A` command and Mode C has not caught up by ≥100 ft, line 2 includes both altitude fields.
- [ ] **AC4 —** `T` with PPI focused toggles limited (callsign disappears, one line of hundreds). With command line focused, `T` types into the radio parser (`T20L` still works).
- [ ] **AC5 —** `M` with PPI focused hides Mode C on full blocks per README; limited unchanged.
- [ ] **AC6 —** Clicking the datablock text selects that track.
- [ ] **AC7 —** Crude T01-10 callsign-only labels are gone; no duplicate callsign painted twice.
- [ ] **AC8 —** No `Command` is emitted when toggling `T` or `M` (spy on parser / event log).
- [ ] **AC9 — Research:** Formatters and UI say **datablock** / **Mode C**, not label. Module header cites PCG + CRC FDB/LDB and lists omitted fields.

## Test plan

- Unit: formatter matrix (table-driven).
- Integration: focus routing for `T`/`M`.
- Manual: climb through 100 ft boundary; assigned field appears/disappears.

## Suggested files

- `src/scope/datablock.ts`
- `src/scope/datablock.test.ts`
- `src/scope/fonts.ts` (CSS / canvas font string)
- `src/scope/renderScope.ts`
- `src/scope/scopeKeys.ts`
- `index.html` or app CSS: IBM Plex Mono import (OFL)
