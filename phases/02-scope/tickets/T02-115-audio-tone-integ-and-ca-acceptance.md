# T02-115: Audio Tone Integration & End-to-End CA Alignment Acceptance

**Phase:** 02 Scope — Conflict Alert (CA) STARS Alignment  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-111, T02-112, T02-113, T02-114  
**Blocks:** None  

## Goal

Connect the conflict alerting engine, acknowledgment state, and audio tone generator to deliver authentic STARS audio alerting behavior; perform comprehensive end-to-end integration testing of all CA subsystems.

## Research & Standards

Per TI 6191.409 Section 2.16 & Section 7.3:
- Audio Tone: Continuous/periodic audio warning beeps sound as long as at least one active, unacknowledged, uninhibited conflict alert exists.
- Slew Acknowledge: Implied slew-to-ack or command acknowledge silences the tone immediately, while the visual alert transitions to steady red.
- Multi-Conflict Safety: If Track A and Track B conflict is acknowledged (tone silent), and subsequently Track C and Track D enter conflict, the audio tone sounds again until C/D is acknowledged or resolved.
- Resolution: When physical separation exceeds the threshold and tracks diverge, the alert terminates, Line 0 clears, and audio stays silent.

## Scope

- In `src/app/create-app.ts` / `src/app/ca-alert-tone.ts`:
  - Wire audio alert trigger to the count of active *unacknowledged* conflict alerts.
  - Ensure immediate tone cessation when all active alerts are acknowledged or inhibited.
- Update `src/scope/systemLists.ts`:
  - Ensure Alert Status Box (`AL`) reflects the updated alert model and authentic command bindings without `*CA`/`*LA`.
- Create end-to-end integration tests in `src/scope/test/starsConflictAlertIntegration.test.ts`:
  - Test converging aircraft entering Type 4, 3, 2, 1 areas.
  - Test blinking cadence, audio triggering, slew-to-ack silencing, pair inhibit (`CA P`, `CA E`, `CA`), and single-track inhibit (`CA K`).
  - Test track drop / handoff inhibit cleanup.

## Non-goals

- Real-world acoustic profile changes outside the existing synthetic audio generator.
- Multi-sensor radar fusion.

## Acceptance Criteria

- [ ] Audio tone beeps when an unacknowledged conflict occurs.
- [ ] Tone ceases immediately upon slew-to-acknowledge or inhibit.
- [ ] A new unacknowledged conflict correctly re-triggers the tone even if another conflict was previously acknowledged.
- [ ] Full end-to-end scenario test passes with 100% fidelity to STARS specs.
- [ ] `npm test` and `npm run ci` pass cleanly with zero regressions.

## Files

- `src/app/create-app.ts`
- `src/app/ca-alert-tone.ts`
- `src/scope/systemLists.ts`
- `src/scope/test/starsConflictAlertIntegration.test.ts`
