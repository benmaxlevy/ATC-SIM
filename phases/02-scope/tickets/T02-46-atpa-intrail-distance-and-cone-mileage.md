# T02-46 ATPA in-trail distance and cone mileage

**Phase:** 02 Scope (TPA / ATPA addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-44
**Blocks:** T02-47
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Surface the ATPA in-trail distance in two places — the trailing track's datablock, and the mileage digits drawn alongside the cone — driven by the `world.alerts.atpa` pair set from T02-44, with per-track and global enable/inhibit honored.

## Context

`formatFullDatablock` already appends `track.atpaDistance` onto FDB line 3 (`DatablockSource.atpaDistance` at `src/scope/datablock.ts` ~line 79, assembled in `line3Parts` ~line 328). `Aircraft.atpaDistance` exists (`src/core/aircraft.ts` ~line 122). `drawDatablock` in `src/scope/renderScope.ts` paints that line. Nothing ever writes the field. This ticket is the writer, the two formatters, the enable/inhibit state, and the cone-mileage paint.

Consume the pair set the way CA is consumed: the scope reads `world.alerts` and never recomputes pair geometry (`src/scope/palette.ts`; `caSeverityForCallsign`). T02-44 owns `AtpaPair`. The frontmost track in a volume has no leader and produces no pair.

R07 (`docs.virtualnas.net/crc/stars`): "a distance readout is added to the datablock indicating the distance between the affected target and the target it is following." The in-trail distance is displayed together with the warning cone in caution yellow and with the alert cone in ATPA alert orange, so the readout is color-coded by pair status. Cone mileage renders in tenths for non-whole values.

The DCB TPA/ATPA submenu has separate **A/TPA Mileage** (mileage in the cone) and **Intrail Distance** (distance in the datablock) controls. These are two independently toggleable readouts — this ticket implements both behaviors; T02-47 wires the actual DCB cells. Command reference chords `*DE` / `*DI` enable and inhibit the in-trail distance per slewed track or for all tracks. T02-49 already ships the parse (`*DE` / `*DI`, and `*D+` / `*D+E` / `*D+I` for the TPA size / cone-mileage readout); this ticket only consumes the resulting action.

**Figures (Fig 38 Warning Cone, Fig 39 Alert Cone).** The trailing track's FDB shows the in-trail distance on its own line below line 2: `9.88` under `LAX B737` (Fig 38) and under `061 17 F` (Fig 39). The screenshot datablock distance uses **two decimal places**. Cone-length mileage in the same figures is a whole `3` (tenths when non-whole, per R07). Pin the datablock format to the figure; do not assume it matches the cone formatter. The existing comment/example in `src/scope/datablock.ts` and `src/core/aircraft.ts` uses `"2.4"`; whichever format is chosen, the formatter tests in `src/scope/datablock.test.ts` must be updated coherently. Fig 38's leader `SKW2616` also showing `3.97` is that track trailing someone further ahead — not a readout on the frontmost aircraft.

Trainer deltas (product law): single TCP, so no per-position "adapted to display" matrix; no TDW white monitor variant; no aural ATPA tone. CA (T04-09) stays `CA` text plus tone.

## Research

Read **R07** `docs.virtualnas.net/crc/stars` — Warning Cone, Alert Cone, and the TPA/ATPA DCB / command-reference rows for A/TPA Mileage, Intrail Distance, `*DE` / `*DI`.

- Search: `STARS ATPA in-trail distance datablock cone mileage`
- **Terms:** in-trail distance, A/TPA Mileage, Intrail Distance, cone mileage. Not CA, not DRI, not wake.
- Comment: Fig 38/39 datablock values are two-decimal (`9.88`); cone digits are tenths-for-non-whole (`3`). R07 colors the in-trail readout with the cone even when a screenshot of the FDB looks white.

## Scope

- Formatter pair (new small helper, e.g. `src/scope/atpaReadout.ts`, or next to the datablock assembler):

  | Readout | Source | Format |
  | --- | --- | --- |
  | Intrail Distance (FDB) | `AtpaPair.distanceNm` | two decimal places, matching Fig 38/39 (`9.88`, `3.97`; `2.4` becomes `2.40`) |
  | A/TPA Mileage (cone) | `AtpaPair.requiredNm` | tenths for non-whole values (`3` → `"3"`, `2.5` → `"2.5"`) |

- Writer: each frame or tick, populate `Aircraft.atpaDistance` (or an equivalent scope-side derivation passed into `formatFullDatablock`) from `world.alerts.atpa`. The scope reads `world.alerts` and does not recompute pair geometry. The frontmost track in a chain receives nothing. A track that is a trailer in one pair and a leader in another still shows **its** trailing distance.
- FDB line 3 already joins `assignedField`, `squawkField`, `atpaField`. Keep that assembly. Paint only the ATPA field in the pair-status color; do not recolor assigned altitude, squawk mismatch, or the rest of the block. Warning → caution yellow; alert → ATPA orange (T02-45 cone color, **not** CA/MSAW red). Monitor pairs do not add the datablock in-trail field (R07 displays it together with the warning / alert cone). LDB and PDB stay unchanged.
- Enable/inhibit state, stored on the scope view / `TrackDisplay`, **not** on `Aircraft.intent`:
  - global Intrail Distance and A/TPA Mileage flags on `AtpaState` (`src/scope/tpa.ts` / `ScopeView`);
  - per-track inhibit on `TrackDisplay`.
  Each readout honors its own global flag and per-track inhibit independently: inhibiting mileage must not hide the datablock distance, and vice versa. `*DE` / `*DI` (and the all-tracks form if T02-49 emits it) mutate the in-trail flags; `*D+` / `*D+E` / `*D+I` mutate cone-mileage flags. Until T02-47, DCB cells are not required — the flags just have to exist and be honored. Do not take T02-45's cone enable flags (`*AE` / `*BE`).
- Cone mileage text drawn alongside the cone in the cone's color (monitor blue / warning yellow / alert orange), reusing T02-45 cone geometry for placement (vertex on the trailer, length = `requiredNm`). Do not invent a second wedge. Wave C is parallel: take a pose `{ trailing, leading, requiredNm, status }` and place the digits on that geometry.
- Clear the readout the moment a track leaves the pair set. No residue on the next frame, matching CA clear.

## Out of scope

- Cone / wedge geometry and monitor/warning/alert stroke (T02-45).
- DCB TPA/ATPA submenu cells (T02-47).
- The chord parser (T02-49 already ships the parse; this ticket only consumes the resulting action).
- Any live-path read of `wakeCategory`. Minima stay on the pair as `requiredNm`.
- Conflict alert (T04-09).

## Implementation notes

`drawDatablock` currently uses one `fillStyle` for all three lines. Split the ATPA field out of that fill, or draw line 3 in segments, so pair-status color cannot leak onto `A040` / squawk mismatch.

Extend `AtpaState` without taking T02-45's cone enable flags. PREF already serializes `view.atpa`; new fields must default when an old snapshot omits them.

Reuse T02-45 colors. Do not introduce a third orange. Do not write enable/inhibit onto `Aircraft.intent`.

## Acceptance criteria

- [ ] **AC1 —** A trailing track in `world.alerts.atpa` shows the in-trail distance on FDB line 3; the frontmost track in that volume (no trailing pair) does not. A three-track chain gives two readouts, each showing that track's distance to the aircraft immediately ahead.
- [ ] **AC2 —** The datablock string uses two decimal places matching Fig 38/39 (`9.88`, `2.40` not `2.4`). `src/scope/datablock.test.ts` and the `"2.4"` comments on `DatablockSource` / `Aircraft.atpaDistance` are updated to the same format.
- [ ] **AC3 —** Warning paints the datablock in-trail field caution yellow; alert paints it ATPA orange. The rest of the FDB (and CA `CA` / MSAW tint) is unchanged. Monitor pairs do not add the field.
- [ ] **AC4 —** Cone mileage digits render alongside the T02-45 cone in the cone's color, formatted in tenths for non-whole values (`3` and `2.5`). They are not two-decimal datablock strings.
- [ ] **AC5 —** Global and per-track inhibit suppress the datablock readout and the cone mileage independently. When a pair drops out of `world.alerts.atpa`, both readouts clear on the next frame with no residue.
- [ ] **AC6 — Research:** the readout module cites R07 for the datablock distance, yellow/orange pairing, and tenths cone mileage, and records that Fig 38/39 show two-decimal datablock values while cone digits use tenths for non-whole values.

## Test plan

- Unit: `src/scope/atpaReadout.test.ts` — two-decimal in-trail, tenths cone mileage, trailing vs frontmost, three-track chain, pair clear, inhibit matrix (global × per-track × each readout).
- Unit: extend `src/scope/datablock.test.ts` — line 3 cases updated from `"2.4"`; LDB/PDB still omit the field.
- Unit: `applyStarsChordAction` for `*DE` / `*DI` (and `*D+` family) mutates the flags this ticket owns; T02-49 parser tests stay green.
- Regression: existing FDB line 3 assigned-altitude / squawk-mismatch tests, CA / MSAW paint tests.
- `npm test`.

## Suggested files

- `src/scope/atpaReadout.ts` (new)
- `src/scope/atpaReadout.test.ts` (new)
- `src/scope/datablock.ts`
- `src/scope/datablock.test.ts`
- `src/scope/trackDisplay.ts`
- `src/scope/tpa.ts`
- `src/scope/scopeView.ts`
- `src/scope/renderScope.ts`
- `src/scope/renderScope.test.ts`
- `src/scope/starsChord.ts`
- `src/core/aircraft.ts` (comment / write path only if the string is stored on the aircraft)
