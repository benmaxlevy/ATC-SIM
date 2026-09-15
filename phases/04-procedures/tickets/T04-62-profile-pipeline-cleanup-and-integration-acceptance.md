# T04-62 Profile pipeline cleanup and integration acceptance

**Phase:** 04 Procedures
**Priority:** P1
**Size:** M
**Depends on:** T04-60, T04-61
**Blocks:** none
**Launch:** Implement this ticket only after T04-60 and T04-61 are merged.

## Goal

Remove obsolete profile JSON files (`type-mappings.json`, `simulator-policies.json`, and `aircraft-profiles.generated.json`), update build/npm scripts and documentation, wire flight envelope validation and protection into pilot validation, readback, and kinematics, and verify end-to-end integration acceptance across the simulator.

## Context

With the simplified `src/core/performance/aircraft-profiles.json` schema implemented in T04-60 and the direct generator script with rich kinematic extraction completed in T04-61, the legacy files and indirection layers are obsolete.

In addition to removing deprecated files and updating documentation, this ticket connects the aircraft performance profile limits directly to the pilot agent and flight simulation:
1. Command validation (`src/pilot/validate.ts`) validates commanded speeds against `minControlledSpeedKt` and `maxControlledSpeedKt`, and commanded altitudes against `serviceCeilingFt`.
2. Pilot readbacks (`src/pilot/readback.ts`) speak the rejection detail for SPEED and ALTITUDE rejections (`"unable speed <X>, minimum is <MIN>"`, `"unable speed <X>, maximum is <MAX>"`, `"unable altitude <X>, ceiling is <CEILING>"`).
3. Kinematics (`src/core/kinematics.ts`) applies flight envelope protection clamping aircraft speed to regime/profile speed bounds and altitude to `serviceCeilingFt`.
4. Tests across validate, readback, kinematics, and performance profiles verify these behaviors and full repository CI passes.

## Scope

- Pilot validation wiring (`src/pilot/validate.ts`):
  - Validate commanded speed against the aircraft's performance profile limits (`minControlledSpeedKt` and `maxControlledSpeedKt`, resolved via `performanceRegistry.getProfile(aircraft.aircraftType)` or current regime limits):
    - When commanded speed < `minControlledSpeedKt`: reject with `{ ok: false, reason: "SPEED", detail: "unable speed <X>, minimum is <MIN>" }`.
    - When commanded speed > `maxControlledSpeedKt`: reject with `{ ok: false, reason: "SPEED", detail: "unable speed <X>, maximum is <MAX>" }`.
  - Validate commanded altitude against the aircraft's performance profile `serviceCeilingFt`:
    - When commanded altitude > `serviceCeilingFt`: reject with `{ ok: false, reason: "ALTITUDE", detail: "unable altitude <X>, ceiling is <CEILING>" }`.
- Pilot readback formatting (`src/pilot/readback.ts`):
  - Update `formatRejectReadback` to speak `args.detail` for `SPEED` and `ALTITUDE` rejections when `args.detail` is provided (e.g. `"Delta 123 unable speed 120, minimum is 140"`, `"Delta 123 unable altitude 45000, ceiling is 41000"`), falling back to `"unable speed"` / `"unable altitude"` when detail is absent.
- Kinematics flight envelope protection (`src/core/kinematics.ts`):
  - In `stepAircraft`, enforce flight envelope protection by clamping aircraft speed to regime/profile speed bounds (`minSpeedKt` / `maxSpeedKt` or profile limits) and clamping altitude to `serviceCeilingFt`.
- Delete deprecated legacy files:
  - `tools/aircraft-profiles/type-mappings.json`
  - `tools/aircraft-profiles/simulator-policies.json`
  - `src/core/performance/aircraft-profiles.generated.json`
- Update `package.json`:
  - Verify `npm run aircraft:profiles` and `npm run aircraft:profiles:check` work with the new single-file workflow without legacy flags.
- Update `tools/aircraft-profiles/README.md`:
  - Document the single-file `src/core/performance/aircraft-profiles.json` architecture.
  - Explain the runtime cascade and how to populate new aircraft with OpenAP.
- Update tests:
  - `src/pilot/test/validate.test.ts`: test profile min/max speed and service ceiling rejections with exact reason and detail.
  - `src/pilot/test/readback.test.ts`: test `formatRejectReadback` speaking SPEED and ALTITUDE detail strings alongside callsigns.
  - `src/core/test/kinematics.test.ts`: test envelope protection clamping in `stepAircraft` for speed and altitude.
  - `src/core/performance/aircraft-profiles.test.ts`: test end-to-end integration acceptance with OpenAP profiles, cascade fallbacks, and simulation stepping.
  - Full `npm run ci` passes cleanly.

## Out of scope

- New radar or display features.
- Paid speech or cloud services.
- Changing FMS route-following lateral guidance.

## Contract Table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `validateInstructions(ac, [{ type: "SPEED", speedKt: 120 }])` where min is 140 kt | Rejects with `{ ok: false, reason: "SPEED", detail: "unable speed 120, minimum is 140" }` | No state change | Valid speed within bounds passes | `validate.test.ts` |
| `validateInstructions(ac, [{ type: "SPEED", speedKt: 380 }])` where max is 350 kt | Rejects with `{ ok: false, reason: "SPEED", detail: "unable speed 380, maximum is 350" }` | No state change | Valid speed within bounds passes | `validate.test.ts` |
| `validateInstructions(ac, [{ type: "ALTITUDE", altitudeFt: 45000, verb: "CLIMB" }])` where ceiling is 41,000 ft | Rejects with `{ ok: false, reason: "ALTITUDE", detail: "unable altitude 45000, ceiling is 41000" }` | No state change | Altitude <= ceiling passes | `validate.test.ts` |
| `formatRejectReadback({ callsign: "DAL123", reason: "SPEED", detail: "unable speed 120, minimum is 140" })` | Returns `"Delta 123 unable speed 120, minimum is 140"` | Formatted speech string | Missing detail falls back to `"Delta 123 unable speed"` | `readback.test.ts` |
| `formatRejectReadback({ callsign: "DAL123", reason: "ALTITUDE", detail: "unable altitude 45000, ceiling is 41000" })` | Returns `"Delta 123 unable altitude 45000, ceiling is 41000"` | Formatted speech string | Missing detail falls back to `"Delta 123 unable altitude"` | `readback.test.ts` |
| `stepAircraft(ac, dtS, ...)` with commanded speed/alt exceeding envelope | Clamps aircraft speed to regime/profile bounds and altitude to `serviceCeilingFt` | Aircraft state kept within safe envelope | Normal in-envelope commands step normally | `kinematics.test.ts` |
| `npm run aircraft:profiles` | Re-populates `aircraft-profiles.json` cleanly | File updated | Missing OpenAP dependency halts with installation hint | Terminal output |
| `npm run aircraft:profiles:check` | Verifies committed file matches generator | Exit 0 | Drift fails command | Terminal exit code 0 |
| `npm run ci` | Full verification suite across TypeScript, ESLint, Prettier, and Vitest | Clean pass | Any broken import or lingering reference fails CI | CI exit 0 |

## Acceptance criteria

- [ ] **AC1 — Pilot speed bounds validation:** `validateInstructions` checks commanded speed against the aircraft profile limits (`minControlledSpeedKt` / `maxControlledSpeedKt` or regime limits). If below minimum, it rejects with reason `'SPEED'` and detail `'unable speed <X>, minimum is <MIN>'`. If above maximum, it rejects with reason `'SPEED'` and detail `'unable speed <X>, maximum is <MAX>'`.
- [ ] **AC2 — Pilot service ceiling validation:** `validateInstructions` checks commanded altitude against `serviceCeilingFt`. If altitude exceeds ceiling, it rejects with reason `'ALTITUDE'` and detail `'unable altitude <X>, ceiling is <CEILING>'`.
- [ ] **AC3 — Rejection readback formatting:** `formatRejectReadback` formats rejection details for `SPEED` and `ALTITUDE` rejections, speaking the exact unable reason and bound with callsign speech.
- [ ] **AC4 — Kinematics flight envelope protection:** `stepAircraft` clamps aircraft speed to regime/profile speed bounds and altitude to `serviceCeilingFt`, preventing simulated aircraft from exceeding their physical envelope.
- [ ] **AC5 — Legacy file removal:** `type-mappings.json`, `simulator-policies.json`, and `aircraft-profiles.generated.json` are removed from the repository.
- [ ] **AC6 — Tooling alignment:** `package.json` profile scripts run against the unified `src/core/performance/aircraft-profiles.json`.
- [ ] **AC7 — Documentation:** `tools/aircraft-profiles/README.md` documents the simplified single-file model and commands.
- [ ] **AC8 — Integration acceptance tests:** Tests in `src/pilot/test/validate.test.ts`, `src/pilot/test/readback.test.ts`, `src/core/test/kinematics.test.ts`, and `src/core/performance/aircraft-profiles.test.ts` verify envelope validation, rejection readbacks, envelope clamping, and profile-driven simulation.
- [ ] **AC9 — Full CI pass:** `npm run ci` passes with 0 failures, 0 lint warnings, and 0 type errors.

## Test plan

- **Tooling:** Run `npm run aircraft:profiles:test` and `npm run aircraft:profiles:check`.
- **Unit & Integration:** Run `npm test src/pilot/test/validate.test.ts src/pilot/test/readback.test.ts src/core/test/kinematics.test.ts src/core/performance/aircraft-profiles.test.ts`.
- **CI:** Run `npm run ci` from repo root.

## Suggested files

- `src/pilot/validate.ts`
- `src/pilot/readback.ts`
- `src/core/kinematics.ts`
- `src/pilot/test/validate.test.ts`
- `src/pilot/test/readback.test.ts`
- `src/core/test/kinematics.test.ts`
- `src/core/performance/aircraft-profiles.test.ts`
- `tools/aircraft-profiles/type-mappings.json` (delete)
- `tools/aircraft-profiles/simulator-policies.json` (delete)
- `src/core/performance/aircraft-profiles.generated.json` (delete)
- `tools/aircraft-profiles/README.md`
- `package.json`
