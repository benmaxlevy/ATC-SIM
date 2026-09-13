# T02-139 Shared Handoff Datablock UI

**Phase:** 02 Scope — handoff/datablock fidelity  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-138  
**Blocks:** none  
**Launch:** Implement this ticket only. Stop after focused tests and CI.

## Mission

Make Center and Tower outbound handoffs use the same pending and accepted
datablock presentation, including receiver-position text, timed acceptance
attention, and the final white sender display.

## Research

User-supplied `TI 6191.409 Rev. 30`:

- §5.1.9, pp. 5-18–19: the intended receiving-position ID is displayed in
  the datablock during handoff.
- General Rules, p. 5-4: handoff attention uses the defined white/blink and
  timed receiver-position presentation.
- §5.1.10, p. 5-20: after acceptance the sender retains the white FDB until
  explicit return.

Repository finding: existing Center pending/accepted rendering is already
aligned by T02-135/T02-136; Tower must consume the same destination-aware
render state instead of a separate blue/immediate path.

## Scope

- Reuse one pending/accepted datablock presentation for C and Tower.
- Show the actual destination ID in the existing receiver TCP/Field 4 area.
- Preserve pending white FDB, accepted white blink/TCP timing, and final
  solid-white sender FDB behavior already used for Center.
- Keep render geometry, hit testing, field layout, altitude filtering, leader,
  overlap layout, and explicit return-to-unowned behavior consistent.
- Use shared helpers/state; do not duplicate destination-specific drawing
  branches when the same state can render both destinations.

## Acceptance criteria

- [ ] Pending outbound C and Tower datablocks are white FDBs, not blue.
- [ ] Pending datablocks show the correct receiving-position ID in the
      existing Field 4/TCP location.
- [ ] Accepted C and Tower datablocks both use the existing white five-second
      attention/TCP window and then remain solid white.
- [ ] Rendered datablock and hit-test geometry agree for both destinations.
- [ ] All existing datablock fields and non-handoff rendering remain intact.
- [ ] Explicit return-to-unowned produces the existing reduced/unowned display
      for either destination.
- [ ] No new SPC, alert, handoff type, sector, networking, parser, Command IR,
      speech, DCB, pointout, quicklook, or facility branch is added.

## Tests

- `src/scope/test/starsFidelity.integration.test.ts`
- `src/scope/test/ownership.test.ts`
- Add a compact C/Tower parameterized render and hit-test acceptance case.
- Run focused tests, then `npm run ci` after merge.

## Non-goals

- Handoff initiation or acceptance state/timing; T02-137/T02-138.
- New datablock fields, new alert/SPC systems, or additional positions.
- Pointouts, quicklook, parser, Command IR, speech, DCB, networking, or
  unrelated scope presentation.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, with changed paths,
progressive commits, focused test results, and unresolved scope concerns.
