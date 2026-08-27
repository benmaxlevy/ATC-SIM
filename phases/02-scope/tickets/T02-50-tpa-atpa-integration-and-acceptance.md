# T02-50 TPA / ATPA integration and acceptance

**Phase:** 02 Scope (TPA / ATPA addendum)
**Priority:** P0
**Size:** L
**Depends on:** T02-47, T02-48
**Blocks:** none
**Launch:** Implement this ticket only.

## Goal

End-to-end integration and acceptance for the whole TPA / ATPA addendum (T02-43–49), proving the player-visible loop and zero regressions:

- Two arrivals sequenced onto the ILS 27 final inside the ATPA volume.
- The trailing track shows a blue monitor cone pointing at its leader with the required mileage.
- The cone turns yellow as predicted violation crosses 45 seconds, then orange at 24 seconds or an actual violation.
- The in-trail distance appears in the trailing datablock (warning / alert).
- The four DCB TPA/ATPA cells toggle each piece, and PREF round-trips the state.
- `*J3` on a slewed track still draws a manual J-ring.

This ticket adds **no features**. It is the fourteenth-swarm gate.

*(Wake-category in-trail minima stay deferred in `phases/LATER-IMPLEMENTATION-BACKLOG.md`. Do not invent a matrix.)*

## Context

This is the capstone integration ticket for the Fourteenth Swarm (T02-43–50). T02-47 and T02-48 close the addendum: volumes and pairing (T02-43–44), cones and readouts (T02-45–46), live DCB cells (T02-47), manual per-track TPA rings / `*P` cones (T02-48), and the slew-chord parser (T02-49). This ticket proves they work together on a real `World`.

Frozen product law from `phases/SWARM.md` ("Fourteenth swarm planned") is the acceptance bar, not a suggestion:

- **Separation minima are basic radar only.** 3 NM, reduced to 2.5 NM when both tracks of a pair are established on the same final inside 10 NM of the threshold. Cone length never varies by aircraft type. Minima live in volume JSON (`basicSeparationNm`, `reducedSeparationNm`, `reducedWithinNm`), not literals on a live path.
- **Volumes are data, walked by `approachId`.** `ATPA27` / `ATPA09` are rows. A third runway adds JSON, never an `if`.
- **Frozen ATPA grammar (R07):** cone vertex on the trailing target, oriented toward its leader, length equal to the required in-trail minimum, tenths for non-whole values. Monitor cone in TPA blue (`PALETTE.tools`). Warning cone yellow (`PALETTE.caution`) when predicted to violate within **45 s**. Alert cone orange (`PALETTE.atpaAlert`) when already violating or predicted within **24 s**. Alert supersedes warning supersedes monitor supersedes a manual TPA cone. J-rings are not cones and are never suppressed.
- **Trainer deltas:** single TCP (no per-position adapted-to-display matrix). No TDW white monitor variant. No aural ATPA tone. Volumes are authored trainer geometry.
- **CA is untouched.** T04-09 stays `CA` datablock text plus tone. Still **no** 3 NM CA halo. Circles on this scope are TPA J-rings only.
- **Chords are scope-only.** `*J` / `*P` / `*A` / `*B` / `*D` never produce Command IR; `DAL123 H270` still turns.

## Research

Read **R07** `docs.virtualnas.net/crc/stars` — ATPA overview, Monitor / Warning / Alert cones, TPA ATPA submenu, Command Reference Table 36.

- Review every acceptance criterion on T02-43 through T02-49 (T02-48 is the manual per-track TPA / `*P` ticket this swarm ships; do not invent extra chords).
- Verify full suite execution: `npm test`, `npm run build`, and `npm run ci`.

## Scope

- Create `src/scope/atpaFidelity.integration.test.ts`. It drives a real `World` through `stepWorld` with two aircraft converging on the final and asserts:
  1. **Status progression.** Eligible pair inside the volume; status walks `monitor` → `warning` (predicted time-to-violation under 45 s) → `alert` (under 24 s, or `distanceNm < requiredNm` already). The pair set has one row: trailing follows leading. The frontmost track produces no pair.
  2. **Cone strokes and colors.** `renderScope` on a mock canvas context. Trailing track paints one unfilled wedge: vertex at the trailer, axis toward the leader, length = `requiredNm`. Stroke is `PALETTE.tools` (monitor), `PALETTE.caution` (warning), `PALETTE.atpaAlert` (alert). `PALETTE.alert` (`#FF0000`) is never the cone stroke. Cone mileage digits sit alongside the body (`"3"` / `"2.5"`). No `fill` of the wedge.
  3. **Datablock line content.** Trailing FDB line 3 shows in-trail distance to two decimal places (Fig 38/39). Warning paints that field caution yellow; alert paints ATPA orange. Monitor pairs do not add the field. The leader has none.
- Explicit regression sweep — all stay green:
  - conflict alert still has **no** 3 NM halo and still renders `CA` datablock text with its tone;
  - `src/scope/tpa.test.ts`;
  - `src/scope/dcbPref.test.ts`;
  - `src/ui/DisplayControlBar.test.ts`;
  - `src/scope/datablock.test.ts`;
  - `src/core/alerts/conflictAlert.test.ts`;
  - dual-runway integration (`src/scenario/dualRunwayIntegration.test.ts`).
- **Data-first proof:** the same test helper run against `ATPA09` rather than `ATPA27` produces identical pairing, status progression, cone strokes, and datablock readout on the RW09 final. No runway-specific code path.
- **Minima proof:** cone length is unchanged when the leader's `wakeCategory` changes. A grep gate proves `wakeCategory` does not appear in the ATPA engine (`src/core/alerts/atpa.ts`) and is not read on any ATPA live path.
- Documentation:
  - `phases/02-scope/README.md` gains a **"TPA / ATPA Addendum (T02-43–50)"** section with the ticket table and a phase checklist in the same style as the existing STARS CRC addendum sections (T02-34–38, T02-39–42). Add a Launching-an-agent step for this addendum. Leave prior addendum boxes as they are.
  - `phases/SWARM-STATUS.md` gains the fourteenth-swarm completion note (do not delete prior history).
- Verify `npm test`, `npm run build`, and `npm run ci` are all clean.

## Out of scope

- New features of any kind.
- Multi-controller networking / per-position ATPA adaptation.
- Phase 5 scoring and evaluation.
- Wake-category minima (deliberately deferred; already documented in the backlog by T02-44). Do not fill a matrix from recall.

## Implementation notes

- New file only plus docs: `src/scope/atpaFidelity.integration.test.ts`, `phases/02-scope/README.md`, `phases/SWARM-STATUS.md`. Reuse T02-43 volume helpers, T02-44 `world.alerts.atpa`, T02-45 cone geometry / colors, T02-46 formatters, T02-47 `AtpaState` gates, T02-48 / T02-49 `*J3` dispatch. Do not re-derive pairing in the test harness.
- Mock canvas should capture `stroke` / `strokeStyle` (and mileage `fillText`) the way `datablockFidelity.integration.test.ts` captures datablock text. Drive kinematics with `stepWorld`; do not poke `world.alerts.atpa` except as a negative control.
- README table uses the shipped T02-43–49 titles. Checklist items must match what those tickets actually promised (volumes as data, monitor/warning/alert, four live DCB cells, PREF v2, `*J` J-rings beside ATPA, CA untouched).
- Do not weaken CA / MSAW / dual-runway tests to make this file green.

## Acceptance criteria

- [ ] **AC1 —** End-to-end status progression: `atpaFidelity.integration.test.ts` steps a real `World` with two aircraft on the ILS 27 final inside `ATPA27`; they form one pair (trailing follows leading); status walks `monitor` → `warning` (predicted violation under 45 s) → `alert` (under 24 s or already inside `requiredNm`).
- [ ] **AC2 —** Cone rendering and color per status: mock-canvas `renderScope` paints one unfilled wedge on the trailer, vertex coincident with the target, axis toward the leader, length = `requiredNm`; strokes are `PALETTE.tools` / `PALETTE.caution` / `PALETTE.atpaAlert` for monitor / warning / alert; cone mileage digits sit alongside (`"3"` / `"2.5"`); `PALETTE.alert` is unused; the wedge is never filled.
- [ ] **AC3 —** Datablock in-trail distance: the trailing FDB line 3 shows two-decimal in-trail mileage (Fig 38/39); warning paints that field caution yellow and alert paints ATPA orange; the rest of the block (and CA `CA` / MSAW tint) is unchanged; monitor pairs and the frontmost track omit the field.
- [ ] **AC4 —** DCB cells and PREF persistence: the four AUX TPA/ATPA toggles (`atpa-mileage`, `atpa-intrail`, `atpa-alert`, `atpa-monitor`) plus master ATPA each gate only their piece (`effective = atpa.on && atpa[feature]`; Alert Cones gates warning and alert); PREF SAVE/reload round-trips all five `AtpaState` fields at schema `v: 2`; a `v: 1` slot migrates without throwing; no DCB click emits Command IR.
- [ ] **AC5 —** Manual chord J-ring still works alongside ATPA: `*J3` on a slewed track draws a 3 NM J-ring that still paints when an ATPA cone is showing; ATPA never suppresses J-rings; a manual `*P` cone is suppressed only on warning/alert (`atpaSuppressesManualTpaCone`); conflict alert still has no 3 NM halo and still renders `CA` datablock text with its tone.
- [ ] **AC6 —** RW09 data-first parity plus wake-independence: the same helper against `ATPA09` (volume row only) matches RW27 pairing, status, cones, and datablock readout; cone length is unchanged when the leader's `wakeCategory` changes; a grep proves `wakeCategory` does not appear in `src/core/alerts/atpa.ts` and is not read on any ATPA live path.
- [ ] **AC7 —** `npm test`, `npm run build`, and `npm run ci` are clean; `tpa.test.ts`, `dcbPref.test.ts`, `DisplayControlBar.test.ts`, `datablock.test.ts`, `conflictAlert.test.ts`, and `dualRunwayIntegration.test.ts` stay green; `phases/02-scope/README.md` has the TPA / ATPA Addendum (T02-43–50) table and checklist; `phases/SWARM-STATUS.md` has the fourteenth-swarm completion note.

## Notes

Manual QA of the player loop (`npm run dev` → two ILS 27 arrivals inside the volume → blue monitor cone with mileage → yellow then orange → in-trail field → four DCB cells → `*J3` J-ring) is skip-with-reason when no visual operator is watching Chrome. Automated tests prove the items above. **Do not invent a visual pass.**

## Test plan

- Targeted: `npm test src/scope/atpaFidelity.integration.test.ts`.
- Regression: `src/scope/tpa.test.ts`, `src/scope/dcbPref.test.ts`, `src/ui/DisplayControlBar.test.ts`, `src/scope/datablock.test.ts`, `src/core/alerts/conflictAlert.test.ts`, `src/scenario/dualRunwayIntegration.test.ts`.
- Grep: `wakeCategory` absent from `src/core/alerts/atpa.ts` (and ATPA live paths).
- Full automated suite: `npm test`.
- Full project verification: `npm run build` and `npm run ci`.
- Manual: player loop on Chrome. skip-with-reason if no visual operator; never an invented pass.

## Suggested files

- `src/scope/atpaFidelity.integration.test.ts` (new)
- `src/scope/renderScope.ts`
- `src/scope/datablock.ts`
- `src/core/alerts/atpa.ts`
- `src/scope/tpa.ts`
- `src/ui/DisplayControlBar.tsx`
- `phases/02-scope/README.md`
- `phases/SWARM-STATUS.md`
