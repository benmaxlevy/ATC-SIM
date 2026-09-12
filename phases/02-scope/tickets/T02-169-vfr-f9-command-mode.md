# T02-169 VFR F9 flight-plan command mode

**Phase:** 02 Scope
**Priority:** P0
**Size:** M
**Depends on:** T02-168
**Blocks:** none
**Merge target:** `feat/flight-plan-f6-f9`
**Launch:** Implement this ticket only.

## Mission

Add a distinct RPO `F9` / VFR flight-plan command mode for local VFR
flight-plan creation, modification, deletion, and active-track creation while
preserving the existing `F9`/`Ctrl+F9` DCB routing and VFR list architecture.

## Manual research

Authoritative source: `/home/ben/Documents/stars refs/full_manual.pdf`.

- Appendix D Table D-1, printed p. D-2: RPO `F9` deletes, creates, and
  modifies VFR flight plans and requests flight-plan transfer.
- §5.4.7, printed p. 5-81: `F9`, then VFR ACID or VFR-list tabular line, then
  Enter deletes an owned VFR plan from the VFR list.
- §5.5.10, printed pp. 5-129–5-133: `F9` VFR creation/modification with ACID,
  departure/exit or arrival data, aircraft type/equipment, requested altitude,
  and optional controlling TCP.
- §5.5.13, printed p. 5-139: F9 plus optional `*`/requested altitude and
  slew-to-track creates an interfacility VFR flight plan from an active local
  track.
- §5.6.19, printed pp. 5-177–5-178: F9 retransmits a VFR plan with amended fix
  data.

Trainer delta: represent VFR/ARTCC exchange as local simulated state only. Do
not send network messages or claim interfacility NAS behavior.

## Scope

- Add unmodified F9 command routing while preserving `Ctrl+F9` DCB behavior.
- Paint a VFR-plan mnemonic in Preview Area for F9 entry.
- Parse VFR create/modify input shaped as:

  ```text
  F9 <ACID> <departure>*<exit-or-arrival>
     [<aircraft type>[/<equipment suffix>]]
     [<requested altitude>]
     [<TCP>]
  Enter
  ```

- Distinguish the manual delete form:

  ```text
  F9 <VFR ACID or VFR-list index> Enter
  ```

- Support active-track creation:

  ```text
  F9 [*] [<requested altitude>]
  then slew/click an associated VFR track
  ```

- Support amended-fix/retransmit state locally, using existing VFR list and
  `FlightPlan` representations where possible.
- Keep VFR entries in `VL`/VFR list projections until the local trainer
  acceptance/correlation rule removes them.
- Keep F9 scope commands out of Command IR, readback, pilot intent, and
  kinematics.
- Update help/reference copy with F9 create, modify, delete, and active-track
  forms plus the trainer-local delta.

## Acceptance criteria

- **AC1:** F9 is handled in both focus modes; `Ctrl+F9` retains its existing DCB
  behavior.
- **AC2:** `F9 N123AB KDEM*RW27 C172 050 Enter` creates a local pending VFR plan
  and displays it in the VFR list.
- **AC3:** A valid F9 VFR command can modify route, aircraft type/equipment,
  requested altitude, or TCP without changing aircraft kinematics.
- **AC4:** `F9 <VFR ACID or VFR-list index> Enter` deletes the VFR-list entry.
  If the same plan is also represented in FL, complete deletion still follows
  the documented TERM CNTL/local trainer rule.
- **AC5:** F9 active-track creation supports optional intermediate-fix `*` and
  requested-altitude data, then associates the local VFR plan to the clicked
  eligible track.
- **AC6:** Invalid ACID, route, type, duplicate, capacity, and ambiguous index
  inputs produce explicit rejection feedback.
- **AC7:** F9 does not emit Command IR/readback, invoke the radio parser, alter
  pilot intent, or mutate aircraft kinematics.
- **AC8:** Existing `VL`/`*TV` list visibility, formatting, and unrelated F9
  DCB behavior remain green.
- **AC9:** Help/reference text documents F9’s overloaded create/delete forms
  and the local simulated ARTCC result.

## Tests

- Add `src/scope/test/vfrFlightPlanCommands.integration.test.ts` covering
  create → list → modify → delete and active-track creation.
- Extend `src/scope/test/scopeKeys.test.ts` with F9 versus Ctrl+F9 routing and
  radio-parser isolation.
- Extend `src/scope/test/systemLists.operational.test.ts` only where needed to
  prove VFR-list projection and deletion.
- Extend core flight-plan tests only if a generic VFR validation rule is added.
- Run `npm run ci` after implementation.
- Run `$check-stars-manual` against this ticket and its implementation.
- Manual keyboard walk: F9 VFR creation, F9 deletion, and F9 active-track form;
  mark visual or interaction-only checks as Manual.

## Likely files

- `src/scope/scopeKeys.ts`
- `src/scope/previewArea.ts`
- `src/scope/previewParse.ts`
- `src/scope/systemLists.ts`
- `src/scope/keymap.ts`
- `src/core/flightPlan.ts` only if generic VFR validation/state requires it
- `src/scope/test/vfrFlightPlanCommands.integration.test.ts`
- `src/scope/test/scopeKeys.test.ts`
- `src/scope/test/systemLists.operational.test.ts`

## Non-goals

- F6 FLT DATA; owned by T02-168.
- Real ARTCC/IFDT/network messages or multi-controller ownership.
- F2 TRK RPOS, F3 suspend lifecycle, F8 TSAS/FMA, F10 IFDT, F12, or F13.
- Unsupported datablocks, Command IR, radio, speech, pilot execution, or
  kinematics.
- Replacing `*TV` VFR-list display commands.
- Facility-specific branches or new production scenario data.

## Handoff

Worker returns changed paths, commit IDs, tests, and exactly `READY TO MERGE`
or `BLOCKED`.
