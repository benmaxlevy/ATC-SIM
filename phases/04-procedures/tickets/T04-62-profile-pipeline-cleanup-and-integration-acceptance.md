# T04-62 Profile pipeline cleanup and integration acceptance

**Phase:** 04 Procedures
**Priority:** P1
**Size:** S
**Depends on:** T04-60, T04-61
**Blocks:** none
**Launch:** Implement this ticket only after T04-60 and T04-61 are merged.

## Goal

Remove obsolete profile JSON files (`type-mappings.json`, `simulator-policies.json`, and `aircraft-profiles.generated.json`), update build/npm scripts and documentation, and verify end-to-end integration acceptance across the simulator.

## Context

With the simplified `src/core/performance/aircraft-profiles.json` schema implemented in T04-60 and the direct generator script completed in T04-61, the legacy files and indirection layers are obsolete.

This ticket removes the deprecated files, updates `package.json` and documentation, and runs the full test suite to guarantee end-to-end flight performance integration.

## Scope

- Delete deprecated files:
  - `tools/aircraft-profiles/type-mappings.json`
  - `tools/aircraft-profiles/simulator-policies.json`
  - `src/core/performance/aircraft-profiles.generated.json`
- Update `package.json`:
  - Verify `npm run aircraft:profiles` and `npm run aircraft:profiles:check` work with the new single-file workflow without legacy flags.
- Update `tools/aircraft-profiles/README.md`:
  - Document the single-file `src/core/performance/aircraft-profiles.json` architecture.
  - Explain the runtime cascade and how to populate new aircraft with OpenAP.
- End-to-end integration verification:
  - Ensure simulation world (`src/core/world.ts`), kinematics (`src/core/kinematics.ts`), and FMS turns (`src/core/fms/lateral.ts`) step aircraft correctly using the new merged dataset.
  - Verify that populated aircraft climb and fly at OpenAP rates, while unpopulated aircraft fly at default policy rates.
  - Full `npm run ci` passes cleanly.

## Out of scope

- New radar or display features.
- Paid speech or cloud services.

## Contract Table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `npm run aircraft:profiles` | Re-populates `aircraft-profiles.json` cleanly | File updated | Missing OpenAP dependency halts with installation hint | Terminal output |
| `npm run aircraft:profiles:check` | Verifies committed file matches generator | Exit 0 | Drift fails command | Terminal exit code 0 |
| `npm run ci` | Full verification suite across TypeScript, ESLint, Prettier, and Vitest | Clean pass | Any broken import or lingering reference fails CI | CI exit 0 |

## Acceptance criteria

- [ ] **AC1 — Legacy removal:** `type-mappings.json`, `simulator-policies.json`, and `aircraft-profiles.generated.json` are removed from the repository.
- [ ] **AC2 — Tooling alignment:** `package.json` profile scripts run against the unified `src/core/performance/aircraft-profiles.json`.
- [ ] **AC3 — Documentation:** `tools/aircraft-profiles/README.md` documents the simplified single-file model and commands.
- [ ] **AC4 — Integration acceptance:** Aircraft stepping in the simulation correctly uses overridden rates for OpenAP aircraft and default rates for fallback aircraft.
- [ ] **AC5 — Full CI pass:** `npm run ci` passes with 0 failures, 0 lint warnings, and 0 type errors.

## Test plan

- **Tooling:** Run `npm run aircraft:profiles:test` and `npm run aircraft:profiles:check`.
- **CI:** Run `npm run ci` from repo root.

## Suggested files

- `tools/aircraft-profiles/type-mappings.json` (delete)
- `tools/aircraft-profiles/simulator-policies.json` (delete)
- `src/core/performance/aircraft-profiles.generated.json` (delete)
- `tools/aircraft-profiles/README.md`
- `package.json`
- `src/core/performance/`
