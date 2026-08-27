# T02-47 DCB TPA/ATPA submenu live cells

**Phase:** 02 Scope (TPA / ATPA addendum)
**Priority:** P0
**Size:** M
**Depends on:** T02-45, T02-46
**Blocks:** T02-50
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

The four ATPA cells in the AUX **TPA/ATPA** submenu stop being disabled chrome and become real toggles, bound to the scope state T02-45 and T02-46 added, and their state persists through PREF.

This ticket **supersedes the ATPA stub half of T02-28**. The TPA toggle and `TPA_MI` spinner remain the T02-28 freeze.

## Context

`renderTpaAtpa` in `src/ui/DisplayControlBar.tsx` already ships a live **TPA** toggle, a `TPA_MI` spinner (`DcbSpinnerCell` `"TPA_MI"`), a live **ATPA** master toggle (`view.atpa.on` / `toggleAtpaOn`), and three `kind="disabled"` cells: **CONES** (`atpa-cones`), **MONITOR** (`atpa-monitor`), **ALERT** (`atpa-alert`). `AtpaState` is `{ on: boolean }` with `shouldPaintAtpaGeometry` forced `false`. PREF round-trips only `atpa.on` (`serializeDcbPref` / `applyDcbPref` in `src/scope/dcbPref.ts`, schema `DCB_PREF_SCHEMA_VERSION = 1`, key `atc-sim.dcb.pref.v1.<icao>`).

T02-45 paints predicted monitor / warning / alert cones. T02-46 writes in-trail distance into the datablock. This ticket does not re-derive either; it gates them from the DCB and PREF.

Trainer deltas, from fourteenth-swarm product law: single TCP, so "at this TCP" is this scope — there is no per-position adapted-to-display matrix. No TDW white monitor variant. No aural ATPA tone. CA stays T04-09 datablock text; still no 3 NM CA halo.

## Research

Read **R07** `docs.virtualnas.net/crc/stars` — "TPA ATPA Submenu". Quote the four cell meanings as documented:

- **A/TPA Mileage** — displays mileage in the A/TPA cone
- **Intrail Distance** — displays intrail distance in the datablock
- **Alert Cones** — displays alert cones at this TCP
- **Monitor Cones** — displays monitor cones at this TCP

The reference has **no separate Warning Cones cell**. Warning cones follow the Alert Cones control. That is an explicit reading of R07: positions "adapted to display ATPA Alert and Warning Cones" are one capability, matching T02-49's `*AE` / `*AI` (warning and alert cones as one pair) versus `*BE` / `*BI` (monitor only).

- Search: `STARS CRC TPA ATPA submenu A/TPA Mileage Alert Cones`
- **Terms:** A/TPA Mileage, Intrail Distance, Alert Cones, Monitor Cones. Not CA halo, not TCAS, not DRI, not aural.
- Comment: four live cells + master; warning rides with Alert Cones; TPA J-rings unchanged.

## Scope

- Replace the three disabled cells. After the existing ATPA master, the submenu is: **A/TPA Mileage**, **Intrail Distance**, **Alert Cones**, **Monitor Cones**. Drop `data-dcb="atpa-cones"`. Reuse `atpa-monitor` / `atpa-alert`; add `atpa-mileage` and `atpa-intrail`. All four are `kind="toggle"` (existing `DcbCellKind` — do not add a kind). Two-line labels, pressed bevel = on, same pattern as TPA/ATPA:

  | Lines | R07 name | `data-dcb` | `AtpaState` field |
  | --- | --- | --- | --- |
  | `A/TPA` / `MI` | A/TPA Mileage | `atpa-mileage` | `coneMileage` |
  | `INTRAIL` / `DIST` | Intrail Distance | `atpa-intrail` | `inTrailDistance` |
  | `ALERT` / `CONES` | Alert Cones | `atpa-alert` | `alertCones` |
  | `MONITOR` / `CONES` | Monitor Cones | `atpa-monitor` | `monitorCones` |

- Extend `AtpaState` in `src/scope/tpa.ts` (and `DEFAULT_ATPA_STATE`). Bind DCB clicks to `scopeView` toggles beside `toggleAtpaOn`. Wire the live pressed-sync in `DisplayControlBar` the same way `tpa-on` / `atpa` already are.

  ```ts
  atpa: {
    on: boolean;              // master, T02-28 meaning unchanged
    coneMileage: boolean;     // numeral in the A/TPA cone (T02-45)
    inTrailDistance: boolean; // datablock in-trail distance (T02-46)
    alertCones: boolean;      // alert **and** warning cones
    monitorCones: boolean;    // monitor cones only
  }
  ```

  Documented defaults: master `on: false` (T02-28 freeze). The four sub-toggles default **`true`** — this single TCP is adapted to display them. T02-45 / T02-46 tests that painted on master-on alone stay valid at these defaults.

- **Master vs the four.** A feature paints only when both latches are on:

  `effective(feature) = atpa.on && atpa[feature]`

  Master off means **no** ATPA geometry and **no** ATPA readouts, regardless of the four. The four cells stay clickable and show their own pressed state while master is off so PREF can store a setup. Alert Cones off suppresses both alert and warning cones; monitor may still paint. A/TPA Mileage off leaves cones (if enabled) without the cone numeral. Intrail Distance off leaves the pair in core state but omits the datablock field.

  Put the gate in `tpa.ts` (replace the stub `shouldPaintAtpaGeometry`) and call it from the T02-45 / T02-46 paint paths. Do not recompute pairs, cone vertices, or distance format here.

- TPA toggle, `TPA_MI` spinner (arm / wheel / commit, radii **2 / 3 / 5 / 10** NM, default 5 NM off, selected-else-owned, TLS/tools stroke), and `DcbMenu` `"TPA_ATPA"` are unchanged.

- PREF schema bump **and** migration in `src/scope/dcbPref.ts`:
  - `DCB_PREF_SCHEMA_VERSION` **1 → 2**. Writes always emit `v: 2`.
  - Storage key stays `atc-sim.dcb.pref.v1.<icao>` — the `v1` in the key is the T02-29 namespace, not the body schema.
  - `serializeDcbPref` / `applyDcbPref` round-trip all five `AtpaState` fields.
  - `parseDcbPrefJson` **accepts `v: 1` and `v: 2`**. A v1 slot (`atpa: { on }`) loads without throwing; the four new fields take the documented defaults above; `on` is preserved. Missing sub-fields on a v2 body also take those defaults (`!== false` for the four, `=== true` for master).
  - Corrupt JSON, wrong ICAO type, or slot-count mismatch still returns factory empty slots, as today. Do not treat a mere version-1 file as corrupt.

- DCB clicks still never emit Command IR. Scope-only state; not `Aircraft.intent`.

- `phases/LATER-IMPLEMENTATION-BACKLOG.md`, same commit, per `.cursor/rules/later-implementation-backlog.mdc`:
  - **Rewrite** "Real ATPA pairing and predicted geometry". It currently says ATPA is a deliberate stored no-op; that becomes false. Replace it with what is now live (volume-scoped pairing, in-trail sequencing, predicted monitor/warning/alert status, cones, datablock in-trail distance, four real DCB cells) and what later work must preserve (data-first volumes walked by `approachId`, no facility branch, CA stays datablock text with no halo, no aural ATPA tone).
  - **Update** "Richer TPA controls": the `*J` chord and per-track targeting arrive in **T02-48** and **T02-49**, not as open follow-ups.
  - **Do not delete** "ATPA separation criteria not yet modeled" (T02-44).

## Out of scope

- Pairing engine, cone geometry, colors, 45 s / 24 s prediction (T02-44 / T02-45).
- Datablock in-trail distance formatting (T02-46).
- Slew-chord parser (T02-49) and dispatch fill-in.
- Manual `*P` cones and per-track `*J` rings (T02-48).
- Wake-category minima, aural ATPA, CA halos, CRDA.

## Implementation notes

Keep the four toggles allocation-free booleans on `ScopeView.atpa`. `runAuxCell` like `toggleTpaOn` / `toggleAtpaOn`. Update the T02-28 AC3 test and the T02-30 `shouldPaintAtpaGeometry(true) === false` assertion — both freeze the stub this ticket removes. Existing TPA ring and CA-no-halo tests stay green.

No `if (icao === "KDEM")`. Cell labels are generic; volumes and pairs are already data-first.

## Acceptance criteria

- [ ] **AC1 —** Each of the four cells is a `kind="toggle"` control (not `disabled`). Clicking it flips its `AtpaState` field and the cap's pressed / ON visual. With master ATPA on and the other three at defaults, A/TPA Mileage hides only the cone numeral, Intrail Distance hides only the datablock field, Alert Cones hides alert and warning cones (monitor may remain), and Monitor Cones hides only the monitor cone.
- [ ] **AC2 —** Master ATPA off suppresses every ATPA cone and every ATPA readout even when all four sub-toggles are on. The four cells remain clickable and keep their own pressed state.
- [ ] **AC3 —** TPA J-rings and the `TPA_MI` spinner still behave as T02-28 froze them: 2 / 3 / 5 / 10 NM, default 5 NM off, selected-else-owned, TLS/tools stroke, not CA red.
- [ ] **AC4 —** PREF SAVE then a reload helper restores master ATPA and all four new fields from the slot (unit, fake storage).
- [ ] **AC5 —** A slot stored under PREF `v: 1` (`atpa: { on }` only) loads without throwing, keeps `on`, and applies the documented defaults for the four new fields. Corrupt JSON still falls back to factory. No DCB click emits Command IR; `DAL123 H270` still turns.
- [ ] **AC6 — Research:** module / DCB comments name R07 and quote the four cell meanings; they state the Alert-covers-Warning reading; the backlog rewrite listed above exists in the same commit, and the T02-44 separation-criteria subsection is still present.

## Test plan

- Unit: `src/scope/tpa.test.ts` — four toggles, master-off suppression helper, TPA ring regression (T02-28 AC1/AC2/AC4).
- Unit: `src/scope/dcbPref.test.ts` — serialize/apply round-trip of the five ATPA fields; v1 JSON migrates; corrupt JSON still factory.
- Integration: `src/ui/DisplayControlBar.test.ts` — four live `data-dcb` ids, no `atpa-cones`, `tpa-mi` still a spinner.
- Regression: `src/ui/dcbAddendumAcceptance.test.ts` (drop the stub `shouldPaintAtpaGeometry(true) === false` freeze), existing CA tests, heading command.
- `npm test`.

## Suggested files

- `src/ui/DisplayControlBar.tsx`
- `src/scope/tpa.ts`
- `src/scope/tpa.test.ts`
- `src/scope/scopeView.ts`
- `src/scope/dcbPref.ts`
- `src/scope/dcbPref.test.ts`
- `src/scope/renderScope.ts` (gate only, if T02-45 still keys off master alone)
- `src/ui/dcbAddendumAcceptance.test.ts`
- `src/ui/DisplayControlBar.test.ts`
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`
