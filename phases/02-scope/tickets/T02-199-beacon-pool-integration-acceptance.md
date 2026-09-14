# T02-199 Beacon-pool integration, acceptance, and documentation

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-198  
**Blocks:** none  
**Merge target:** `feature/beacon-pools`  
**Launch:** Implement this ticket only. Stop at the configured swarm boundary.

## Mission

Remove duplicate pool consumers, wire scenario/world adaptation through every
plan-creation path, correct no-code projections, and prove the complete
beacon-pool behavior against the supplied manuals and Phase 2 goals.

## Manual research

Authoritative sources:

- `/home/ben/Documents/stars refs/full_manual.pdf`:
  - §§5.5.1 and 5.5.5, pp. 5-85–5-110: creation defaults, selectors, and
    `CAPACITY — BCN`.
  - §§5.5.7–5.5.9, pp. 5-116–5-129: pending/active discrete plans and
    association distinctions.
  - §5.6.15, p. 5-164: release assigned beacon.
  - §5.6.17, pp. 5-167–5-179: flight-plan modification boundaries.
- `/home/ben/Documents/stars refs/quick_reference_manual.pdf`, p. 18:
  creation command forms and pool selectors.

ATC-SIM remains a local STARS-like trainer. The manual is authoritative for
terminology and command semantics; it does not require official pool contents,
networked allocation, or random selection.

## Contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Scenario JSON declares beacon pools/default | Load generic configuration | F6, abbreviated, modal, and scenario plan paths share it | Invalid config rejects load/configuration | §§5.5.1/5.5.5 |
| Scenario IFR plan omits beacon | Resolve configured default policy | Plan and spawned target share assigned plan beacon when one is allocated | Default `none` preserves no-code plan | §5.5.5/Table 5-7 |
| Scope and modal use `+` or `/1` | Resolve the same configured pool | No duplicate hard-coded pool table remains | Exhaustion → `CAPACITY — BCN` | Table 5-7 |
| Plan with no assigned beacon in FL/TAB | Display no assigned beacon | No fake assignment or correlation key is created | Do not display `1200` as a plan-side substitute | Table 5-7; §§5.5.7–5.5.9 |
| Aircraft receives `SQ 4721` | Preserve aircraft reported/assigned squawk separation | Plan beacon unchanged; existing provenance/correlation rules remain | No automatic plan rewrite | §5.5.9; T02-176/T02-183 trainer contract |
| Release then allocate | Reuse released code when free | Release remains plan-side | No silent association | §5.6.15 |
| Existing explicit beacon duplicate | Reject | No partial plan/world mutation | `DUP BCN` | §§5.5.5/5.6.17 |

## Scope

- Wire adaptation from generic scenario JSON into world creation and all
  existing plan-side creation/edit paths.
- Remove `CREATION_BEACON_POOLS` and `DRAFT_BEACON_POOLS` duplication.
- Decide and document the boundary between plan-pool allocation and the
  separate random allocator used for unplanned generated aircraft; prevent
  accidental collisions without changing aircraft surveillance provenance.
- Correct FL/TAB and strip projections so absent assigned beacon is absent,
  not a fabricated `1200` or deterministic display-only code.
- Add one feature-level acceptance suite using synthetic pools plus the minimum
  shipped scenario fixture needed to prove loading.
- Update `docs/USER.md`, `src/scope/keymap.ts`, and relevant phase documentation.

## Overall-goal checks

- Scope creation remains Preview Area-only and never emits Command IR.
- Assigned beacon, reported squawk, ACID, association, intent, and kinematics
  remain separate sources of truth.
- F1/F6/radio focus routing remains green.
- Existing `CAPACITY — FP`, `CAPACITY — BCN`, `DUP ID`, and `DUP BCN` feedback
  remains exact.
- No facility-specific allocator branch is added.
- Generic tests use minimal synthetic pools; committed scenario data is checked
  only for its loader contract.

## Tests

- Integration: create abbreviated/F6/modal/scenario plans through the same
  configured pools; omitted/default, explicit `A`, each selector, exhaustion,
  duplicate, release/reuse, and no-code FL/TAB projection.
- Regression: scenario spawn, automatic beacon correlation, radio `SQ`, F1
  pending-discrete creation, F6 focus routing, `*F`, `*FP`, and strip output.
- Run `npm run ci`.
- Manual: inspect Help and `docs/USER.md`; execute the F6, abbreviated, F1,
  selector, no-code, and release walks against both supplied PDFs.

## Manual-review checklist

- [x] §5.5.5 / Table 5-7 omitted beacon behavior is visible and correct.
- [x] `+`, `/`, `/1`–`/4`, and `A` have exact meanings.
- [x] §5.5.7 pending discrete creation still requires a beacon.
- [x] §5.5.9 association remains distinct from plan creation/allocation.
- [x] §5.6.15 release does not rewrite aircraft-reported squawk.
- [x] Help/docs use `assigned beacon`, `reported squawk`, and `beacon pool`
      correctly and claim no official NAS compatibility.
- [x] Phase 2 scope/radio separation and data-first rules remain intact.

## Help/docs

- `src/scope/keymap.ts`: actual default/no-code/selector behavior and trainer
  boundary.
- `docs/USER.md`: exact creation examples, pool configuration posture, no-code
  display, errors, and radio-plan provenance.
- `phases/LATER-IMPLEMENTATION-BACKLOG.md`: update only if this work leaves a
  visible/callable missing pool capability; do not add untouched future work.

## Non-goals

- Full NAS beacon-bank telemetry or controller-network allocation.
- Official KDEM/STARS pool values or claims of operational compatibility.
- Radio `SQ` redesign, Command IR, speech, pilot execution, or route behavior.
- Emergency-code policy beyond existing allocator behavior.
- New DCB controls or unrelated scope polish.

## Suggested files

- `src/scenario/load.ts`
- `src/scenario/types.ts`
- `src/scenario/spawn.ts`
- `src/scenario/ifrFlightPlan.ts`
- `src/scenario/spawnAircraft.ts`
- `src/scope/systemLists.ts`
- `src/scope/scopeKeys.ts`
- `src/scope/keymap.ts`
- `src/scope/test/flightPlanCreation.test.ts`
- `src/scope/test/flightPlanLifecycle.integration.test.ts`
- `src/scenario/test/ifrFlightPlanSpawn.test.ts`
- `docs/USER.md`

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including changed paths, focused
tests, `npm run ci`, manual-review results, and overall-goal results. No merge
or push by worker.
