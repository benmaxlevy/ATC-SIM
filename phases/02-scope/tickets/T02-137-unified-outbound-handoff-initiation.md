# T02-137 Unified Outbound Handoff Initiation

**Phase:** 02 Scope — handoff/datablock fidelity  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-136  
**Blocks:** T02-138  
**Launch:** Implement this ticket only. Stop after focused tests and CI.

## Mission

Route the currently supported outbound handoff-to-C and handoff-to-Tower
actions through one destination-aware initiation function. The receiving
position is data supplied to the function; it must not be selected by
duplicated UI or ownership branches.

## Research

User-supplied `TI 6191.409 Rev. 30`:

- §5.1.9, pp. 5-18–19: the controller initiates a handoff to a specified
  receiving position and the receiving-position ID is displayed.
- §5.1.10, p. 5-20: the receiving position accepts the handoff.

Repository finding: `applyHandoffToSelection()` currently detects Tower and
Center separately; Tower calls its immediate landing/ownership path while
Center creates the existing outbound pending state.

## Scope

- Add or refactor one destination-aware initiation path for the supported
  outbound destinations: Center `C` and Tower `TWR`/the existing Tower ID.
- Pass the selected receiving position into the handoff state and existing
  session event path.
- Preserve eligibility checks, selection behavior, movement, boundary
  handling, logging, and the single-position trainer model.
- Keep the existing destination IDs and current keyboard/UI entry points.
- Leave acceptance timing and final datablock presentation to T02-138 and
  T02-139.

## Acceptance criteria

- [ ] An eligible handoff to Center `C` enters the existing pending outbound
      state through the shared destination-aware function.
- [ ] An eligible handoff to Tower enters the same pending outbound handoff
      lifecycle with the Tower receiving-position ID.
- [ ] The initiation function receives the destination position explicitly;
      callers do not infer the destination from a hard-coded acceptance/UI
      branch after calling it.
- [ ] Existing ineligible-track behavior is unchanged.
- [ ] Existing handoff initiation session events/logs remain correct and
      include the selected destination.
- [ ] No Tower landing/ownership side effect occurs merely because initiation
      was requested; acceptance behavior is T02-138.
- [ ] No new sector, handoff type, SPC, alert, network model, parser,
      Command IR, speech, DCB, pointout, quicklook, or facility branch is
      added.

## Tests

- `src/core/test/handoff.test.ts`
- `src/scope/test/ownership.test.ts`
- `src/scope/test/starsFidelity.integration.test.ts`
- Add minimal parameterized C/Tower coverage at the shared initiation seam.
- Run focused tests, then `npm run ci` after merge.

## Non-goals

- Receiver acceptance timing or automatic acceptance; T02-138.
- Accepted/pending datablock drawing changes; T02-139.
- Real remote-controller, networking, or second-position simulation.
- Pointouts, quicklook, new SPCs, new alerts, parser, Command IR, speech,
  DCB, or unrelated datablock behavior.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, with changed paths,
progressive commits, focused test results, and unresolved scope concerns.
