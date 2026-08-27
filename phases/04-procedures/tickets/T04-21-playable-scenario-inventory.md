# T04-21 Playable scenario inventory

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-17
**Blocks:** T04-20, T05-13
**Launch:** Implement this ticket only. Do not add a second airport or UI picker.

## Goal

Runtime discovers every playable scenario from inventory metadata and loads one by id. Consumers can list airport/scenario labels without hardcoded KDEM IDs or named loader branches.

## Context

`main.tsx` currently selects only `loadKdem()` or `loadKdemIls27()` from a URL query. That makes an airport picker hardcoded even though facility procedure data already follows `data/<icao>/` conventions.

The user-facing picker in T05-13 must dynamically list inventory entries. This ticket provides only its DOM-free source of truth. KDEM remains current default; a second playable airport is separate data work.

## Research

`phases/_shared/extensible-features.mdc`: KDEM is a fixture, not the type system. A new airport uses catalog, scenario, MAPS, and MVA data; no `loadKdem3()` or facility-id switch. Use Scenario and Facility terms from `phases/_shared/glossary.md`.

## Scope

- Define validated, versioned playable-scenario inventory metadata with stable scenario id, airport ICAO, display name, and source/loading reference.
- Add `listPlayableScenarios()` and `loadPlayableScenario(id)` (names may vary) with deterministic inventory ordering.
- Make `main.tsx` resolve `?scenario=` through the registry; missing/invalid id falls back to documented default without crashing.
- Migrate current KDEM default and KDEM ILS scenario into inventory. Existing named loaders may remain compatibility wrappers but must not be the picker/boot decision path.
- Validate inventory references against scenario data and required playable assets. Define clear reject behavior for malformed/missing entries.
- Add a test fixture with a second inventory entry or mock loader proving list/load logic has no KDEM-id branch.

## Out of scope

- Adding a second playable airport, maps, MVA, procedures, or real-world data.
- UI controls, localStorage, restart confirmation (T05-13).
- Remote airport catalog/facility downloads.
- Changing scenario schema beyond metadata required for generic discovery.

## Implementation notes

The inventory may be a manifest JSON/TS module when browser bundling cannot glob scenario JSON reliably. It must be data-driven: adding a playable entry should require inventory/data assets, not edits to `main.tsx`, an enum, or a conditional. Keep query backward compatibility for `kdem` and `kdem-ils27`.

Separate airport from scenario: one airport can have multiple scenarios. The later picker may group by airport, but its options must derive solely from inventory output.

## Acceptance criteria

- [ ] **AC1 —** Given shipped inventory, when listed, then it includes current KDEM default and KDEM ILS scenarios with stable ids, labels, and airport ICAO.
- [ ] **AC2 —** Given each listed id, when loaded, then it returns the same validated Scenario currently used by boot; unknown id falls back to default through one documented boundary.
- [ ] **AC3 —** Given a test-only second airport/scenario inventory entry, when listed and loaded, then it works without a production `KDEM`, `kdem-ils27`, or named-loader selection branch.
- [ ] **AC4 —** Given missing/malformed inventory metadata or asset reference, then validation fails with an actionable error; boot never presents a broken entry.
- [ ] **AC5 —** Given `?scenario=kdem-ils27`, when boot resolves it, then T04-12 behavior remains unchanged.
- [ ] **AC6 —** Automated tests cover AC1–AC5.
- [ ] **AC7 — Research:** Inventory documentation says new airports are data/asset registration, not loader-condition code.

## Test plan

- Unit: inventory parse/list/load/default/invalid entry.
- Integration: query-to-registry boot resolution; existing KDEM and ILS scenario regressions.
- Manual: none.

## Suggested files

- `src/scenario/playableScenarios.ts`
- `src/scenario/playable-scenarios.json`
- `src/scenario/load.ts`
- `src/scenario/trafficQuery.ts`
- `src/main.tsx`
- `src/scenario/playableScenarios.test.ts`
- `src/app/boot-session.test.ts`
