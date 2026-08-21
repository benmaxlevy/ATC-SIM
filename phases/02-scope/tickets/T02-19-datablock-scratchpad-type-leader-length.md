# T02-19 Datablock scratchpad, type, line 3, leader length

**Phase:** 02 Scope
**Priority:** P1
**Size:** M
**Depends on:** T02-04, T02-05, T02-18
**Blocks:** T02-21
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Full datablocks look less like “callsign + two numbers.” Add a **trainer scratchpad**, an **aircraft type** (or assigned H/A/S line 3), and a **slightly longer default leader**. Limited datablocks stay Mode C hundreds. Still IBM Plex / system mono — not a STARS face.

## Context

Phase 2 decision 7 froze:

```
DAL123
030  210
```

This ticket **amends** that freeze. PCG **datablock** / **Mode C** still apply (`R02`). T02-04 explicitly deferred scratchpad / type / CSI.

## Research

Read **R02**, **R05**, **R07** FDB/LDB.

- Search: `STARS full data block scratchpad aircraft type CRC`
- **Terms:** **full datablock**, **limited datablock**, **Mode C**, **scratchpad**, **leader**. Never nametag/label.
- Comment: analog FDB line 2/3; trainer fields, not NAS FP.

## Scope

- Per-track display state: `scratchpad` string 0–4 chars (A–Z0–9). Default empty or a stub (`R27` only if you document it as trainer, not a real landing runway assignment).
- Aircraft **type** stub on the scenario/spawn (e.g. `B738` on KDEM arrivals) **or** line 3 `Hxxx Ayyy Szzz` from intent. Pick **one** primary extra line and freeze it in the phase README. Do not do both if it becomes a 4-line block.
- Full datablock still line 1 = callsign. Line 2 keeps Mode C hundreds + assigned-if-different + GS (T02-04 contract). Extra field(s) go on line 2 tail **or** line 3 — document the columns (character-cell).
- Limited: still one line, Mode C only (no scratchpad).
- `T` / `M` behavior unchanged.
- Leader default still L8. **Length:** increase the frozen pixel length (e.g. 24 → 36 px) **or** two discrete lengths; no rubber-band, no auto-deconflict. DCB length menu is T02-17 if already present.
- Font: Plex/system mono only.

## Out of scope

- Beacon code, real CSI, FP scratchpad from NAS, overlapping-block solver, STARS bitmap font, Command IR changes.

## Implementation notes

Extend `kdem.json` arrivals with optional `aircraftType` (does not affect kinematics). Scratchpad is `TrackDisplay` only; a later key can edit it — if no key this ticket, seed empty and leave an API `setScratchpad(id, s)`.

## Acceptance criteria

- [ ] **AC1 —** `formatFullDatablock` tests include type **or** assigned H/A/S on the frozen extra line.
- [ ] **AC2 —** Limited format is still 3-digit Mode C only.
- [ ] **AC3 —** Scratchpad round-trip on display state (unit); does not change `Aircraft.intent`.
- [ ] **AC4 —** Default leader length &gt; 24 px (or documented discrete set); L5 overlay still 0.
- [ ] **AC5 —** Radio loop `DAL123 H270` unchanged. `npm test` green.
- [ ] **AC6 — Research:** datablock/scratchpad/Mode C comments; README decision 7 updated.

## Test plan

- Unit: formatters, leader px, scratchpad sanitizer (length 4, charset).
- Integration: heading-command still green.
- Manual: FDB readable at 20 NM; not overlapping the symbol on L8.

## Suggested files

- `src/scope/datablock.ts`
- `src/scope/leader.ts`
- `src/scope/trackDisplay.ts`
- `src/scenario/kdem.json` (optional type field)
- `phases/02-scope/README.md` (decision 7)
