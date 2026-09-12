# T02-168 FLT DATA F6 command mode

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-167
**Blocks:** T02-169
**Merge target:** `feat/flight-plan-f6-f9`
**Launch:** Implement this ticket only. Do not start T02-169.

## Mission

Separate full IFR flight-plan creation through RPO `F6` / `FLT DATA` from the
existing no-prefix abbreviated/implied creation path. Preserve the existing
local trainer architecture: Preview Area scope commands never emit Command IR,
readback, pilot intent, or kinematic changes.

## Manual research

Authoritative source: `/home/ben/Documents/stars refs/full_manual.pdf`.

- Appendix D Table D-1, printed p. D-2: RPO `F6` is equivalent to operational
  `FLT DATA` and enters flight-plan data.
- §5.5.1, printed pp. 5-85–5-89: ACID-first abbreviated/implied creation.
- §5.5.5, printed pp. 5-105–5-108: full `FLT DATA` creation; ACID is
  mandatory, optional fields are space-separated and may be entered in any
  order where allowed.
- Table 5-7, printed pp. 5-108–5-110: valid ACID, beacon, TCP/fix, ETA/PTD,
  scratchpad, aircraft, altitude, and flight-rules fields.
- §5.5.7, printed pp. 5-116–5-119: pending discrete-plan creation remains an
  `INIT CNTL` workflow and is not reclassified as F6.

Trainer delta: create and update local records only. Do not implement NAS
flight-data messaging, unsupported datablocks, multi-controller ownership, or
pilot execution.

## Scope

- Add F6 to the always-on scope-key routing and Preview Area command state.
- Paint `FLT DATA` while the F6 command is active.
- Parse the manual-shaped full IFR creation grammar:

  ```text
  F6 <ACID>
     [<assigned beacon>]
     [<TCP> | <entry fix>*<exit fix>[*<flight status>]]
     [<ETA or PTD>E]
     [A<scratchpad 1>]
     [+<scratchpad 2>]
     [<aircraft count>/]<aircraft type>[/<equipment suffix>]
     [<requested altitude>]
     .<flight rules>
  Enter
  ```

- Preserve supported beacon allocation forms: `+`, `/`, `/1`–`/4`, and `A`.
- Preserve no-prefix abbreviated creation as a separate path; do not silently
  reinterpret it as F6.
- Reuse the existing `FlightPlan` model and validation where its fields match
  the manual. Add a schema/API field only if a supported manual field cannot be
  represented without overloading an unrelated field.
- Keep creation local and deterministic; do not mutate aircraft surveillance
  or kinematics.
- Update the command reference/help copy to distinguish abbreviated creation,
  F6 full creation, and F1 pending discrete creation.

## Acceptance criteria

- **AC1:** F6 is consumed in both radio and scope focus without entering the
  radio parser, and Preview Area shows `FLT DATA`.
- **AC2:** `F6 UAL1234 2341 KDEM*RW27 B738 250 .A Enter` creates one local IFR
  flight plan with the represented fields.
- **AC3:** Optional fields accepted by the manual remain space-separated and
  order-independent where the manual allows; malformed fields return explicit
  `FORMAT`, `ILL ACID`, `ILL SCR`, `CAPACITY — FP`, or `CAPACITY — BCN` feedback
  as applicable.
- **AC4:** No-prefix abbreviated creation remains available and has a distinct
  parser/action path from F6.
- **AC5:** F1 pending discrete creation remains available and is not consumed
  by F6 parsing.
- **AC6:** F6 never emits Command IR/readback, changes pilot intent, mutates
  aircraft kinematics, or creates an unsupported datablock.
- **AC7:** Help/reference text documents the three distinct creation paths and
  their trainer-local semantics.

## Tests

- Extend `src/scope/test/flightPlanCreation.test.ts` with F6 entry routing,
  full-field parsing, order/ambiguity errors, and separation from no-prefix and
  F1 creation.
- Extend `src/scope/test/previewArea.integration.test.ts` with F6 command-mode
  and local-record behavior.
- Extend `src/scope/test/scopeKeys.test.ts` with F6 always-on routing in both
  focus modes and radio-parser isolation.
- Update the relevant help/reference acceptance test.
- Run `npm run ci` after implementation.
- Run `$check-stars-manual` against this ticket and its implementation before
  T02-169.
- Manual keyboard walk: F6 → full IFR entry → Preview Area result; mark visual
  or interaction-only checks as Manual.

## Likely files

- `src/scope/scopeKeys.ts`
- `src/scope/previewArea.ts`
- `src/scope/previewParse.ts`
- `src/scope/keymap.ts`
- `src/core/flightPlan.ts` only if representation/validation requires it
- `src/scope/test/flightPlanCreation.test.ts`
- `src/scope/test/previewArea.integration.test.ts`
- `src/scope/test/scopeKeys.test.ts`

## Non-goals

- F9 VFR commands; owned by T02-169.
- F2 TRK RPOS, F3 suspend lifecycle, F8 TSAS/FMA, F10 IFDT, F12, or F13.
- NAS/ARTCC messages, unsupported datablocks, multi-controller networking,
  Command IR, radio, speech, pilot execution, or kinematics.
- Replacing the existing no-prefix abbreviated creation grammar.
- Facility-specific branches or production map/scenario data.

## Handoff

Worker returns changed paths, commit IDs, tests, and exactly `READY TO MERGE`
or `BLOCKED`.
