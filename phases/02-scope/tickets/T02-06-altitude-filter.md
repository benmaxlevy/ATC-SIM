# T02-06 Altitude filter

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-04
**Blocks:** T02-10, T02-13
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

An **altitude filter** (min/max hundreds of feet) suppresses datablocks and leaders (and PTL once it exists) for tracks whose Mode C is outside the band. Position symbols and history remain. Keyboard chord `F` (scope focus) and a data model DCB-lite can bind later.

## Context

README frozen decision 9. Radio `F` is unused in phase 1 tokens, but still **do not** make `F` always-on — keep it scope-focus so a future parser token cannot collide. Filter is a **scope command**: no readback (`phases/_shared/glossary.md`).

May run in parallel with T02-05 / T02-07 after T02-04.

## Research

Read **R05** (STARS altitude filters / display data), **R07** (CRC altitude filter).

- Open: https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap12_section_6.html — altitude filter / Mode C display.
- Search: `STARS altitude filter CRC` and `7110.65 Mode C display filter` (display policy, not radio).
- **Terms:** **altitude filter**. Out-of-filter: keep **target**, drop **datablock** + **leader**. Do not call it “hide planes” or “cull.”
- Help/DCB label: `FILTER` or `ALT FILTER`, not “altitude slider.”

## Scope

```ts
interface AltitudeFilter {
  minHundreds: number; // 0–180 inclusive
  maxHundreds: number; // 0–180, >= min
}

export function inAltitudeFilter(modeCFt: number, f: AltitudeFilter): boolean {
  const h = Math.round(modeCFt / 100);
  return h >= f.minHundreds && h <= f.maxHundreds;
}
```

- Default `000–180`.
- Outside: draw symbol + history; **no** datablock, **no** leader. Selection box on the symbol still OK.
- Clicking a filtered symbol still selects (strips stay in T02-11).
- Keyboard (scope focus): `F` → enter 3-digit min → `Enter` → 3-digit max → `Enter`. Digits shown in a tiny prompt on the PPI or status line (`FIL 050-___`). `Esc` cancels and restores previous filter. Invalid (max < min, non-digits): reject, restore previous, no throw.
- Always-on numeric keys must **not** steal filter digits when radio-focused.
- Clamp hundreds to 0–180.
- Do not hide strips in this ticket (T02-11 always lists everyone).

## Out of scope

- Filter on assigned altitude instead of Mode C, “filter off” as a third mode (000–180 is off), per-track inhibit, DCB widgets (T02-10), MSAW (phase 4).

## Implementation notes

Reuse T02-05 chord timer pattern (`F` then digits). Allow `Backspace` during entry. Accept 1–3 digits with Enter (`50` Enter = 050).

Tests with fake clocks / injected now.

## Acceptance criteria

- [ ] **AC1 —** Automated: 3000 ft in 020–040 true; 1900 ft false; 4000 ft true at 040; 4100 false.
- [ ] **AC2 —** Given traffic at 6000 and 10000, filter `070-090`: the 6000 ft target keeps a box+history and **loses** datablock/leader; 10000 ft keeps full block.
- [ ] **AC3 —** Scope focus: `F` `0` `5` `0` Enter `1` `2` `0` Enter sets 5000–12000 ft.
- [ ] **AC4 —** Radio focus: `F` does not start a filter chord (no binding — if `F` is typed, it sits in the command line as today / unknown token; do not mutate filter).
- [ ] **AC5 —** `Esc` during entry restores prior min/max.
- [ ] **AC6 —** max < min on commit: filter unchanged; no crash.
- [ ] **AC7 —** No `command.accepted` / readback from filter changes.
- [ ] **AC8 — Research:** Control labeled **altitude filter** / `FILTER`. Comment cites FOA/CRC filter analog.

## Test plan

- Unit: predicate, parse 1–3 digit hundreds, clamp, max<min.
- Integration: chord vs radio focus.
- Manual: aircraft climbs through the max; datablock appears when Mode C enters the band.

## Suggested files

- `src/scope/altitudeFilter.ts`
- `src/scope/altitudeFilter.test.ts`
- `src/scope/keymap.ts`
- `src/scope/renderScope.ts`
- `src/scope/scopeKeys.ts`
