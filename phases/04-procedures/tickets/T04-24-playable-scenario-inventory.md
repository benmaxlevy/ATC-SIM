# T04-24 Playable scenario inventory

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-23
**Blocks:** T05-13
**Launch:** Implement this ticket only. Do not add session UI or another airport.

## Goal

Runtime lists and loads every playable scenario from validated inventory metadata. UI consumers receive airport/scenario labels without a hardcoded airport list or named KDEM-loader branch.

## Context

Current boot selects named KDEM loaders. T04-18–23 added configurable departures but not airport/scenario discovery. T05-13 needs one data-first source for every picker option.

`phases/_shared/extensible-features.mdc` makes KDEM a fixture, not the type system. A new airport requires scenario/catalog/MAPS/MVA data plus inventory registration.

## Scope

- Define versioned playable-scenario inventory metadata: stable scenario id, airport ICAO, display label, default marker, and scenario source.
- Add deterministic `listPlayableScenarios()` and `loadPlayableScenario(id)`.
- Resolve `?scenario=` through inventory. Missing/invalid ids use one documented default boundary.
- Migrate current KDEM default and KDEM ILS scenario. Compatibility named loaders may remain, but boot/picker decisions use inventory only.
- Validate inventory references and required playable assets before exposing an entry.
- Prove a second test-only airport/scenario inventory entry needs no production ICAO/scenario conditional.

## Out of scope

- Second playable airport data, remote airport feeds, or live FAA/NASR data.
- UI, persistence, restart confirmation (T05-13).
- Active-runway selection.

## Implementation notes

Use a manifest if browser bundling cannot discover JSON safely. One airport may have multiple scenarios. Adding an entry must be data/assets plus inventory registration, never an edit to `main.tsx` conditionals or a scenario-id enum.

## Acceptance criteria

- [ ] **AC1 —** Shipped inventory lists KDEM default and KDEM ILS scenarios with stable ids, labels, and ICAO.
- [ ] **AC2 —** Every listed id loads its current validated Scenario; invalid id falls back once without boot crash.
- [ ] **AC3 —** A second test-only inventory entry lists and loads with no production `KDEM`/scenario-id selection branch.
- [ ] **AC4 —** Malformed/missing metadata or asset reference rejects before the entry is exposed.
- [ ] **AC5 —** `?scenario=kdem-ils27` retains T04-12 behavior.
- [ ] **AC6 —** Automated tests cover AC1–AC5.
- [ ] **AC7 — Research:** Inventory docs state new airports are data/asset registration, never loader-condition code.

## Test plan

- Unit: inventory parse/list/load/default/invalid entry.
- Integration: query-to-inventory boot resolution; KDEM/ILS regressions.
- Manual: none.

## Suggested files

- `src/scenario/playableScenarios.ts`
- `src/scenario/playable-scenarios.json`
- `src/scenario/load.ts`
- `src/scenario/trafficQuery.ts`
- `src/main.tsx`
- `src/scenario/playableScenarios.test.ts`
