# T02-135 Manual-Aligned Outbound Handoff Datablock Color

**Phase:** 02 Scope — handoff/datablock fidelity  
**Priority:** P0  
**Size:** S  
**Depends on:** T02-134  
**Blocks:** T02-136  
**Launch:** Implement this ticket only. Stop after acceptance and manual review.

## Mission

Remove the unsupported blue outbound-handoff datablock presentation. Keep the
existing handoff-to-C behavior, but render the sender’s initiated handoff as a
manual-aligned white Full Datablock (FDB) with receiver TCP `C`.

## Research

User-supplied `TI 6191.409 Rev. 30`:

- §5.1.9, pp. 5-18–19: initiating a handoff displays the intended receiving
  position ID in the datablock; the receiving display uses a blinking white
  FDB.
- General Rules, p. 5-4: handoff attention and owned/previously-owned FDB
  presentation use white.
- §5.1.10, p. 5-20: accepted sender presentation is a white FDB.

Repository finding: `applyHandoffToSelection()` currently changes the track
ownership display to `center`, causing the sender datablock to use the center
blue palette before acceptance.

## Scope

- Render pending outbound handoffs to `C` with the existing white FDB style.
- Keep receiver TCP `C` in the existing Field 4 position.
- Keep the blue center ownership/position stub only if it remains separate from
  datablock text and does not recolor the datablock.
- Preserve core handoff state, routing, logging, acceptance, movement, and
  boundary lifecycle.
- Preserve FDB Field 0/2, lines, leader, hit testing, overlap layout, and
  altitude-filter behavior.

## Acceptance criteria

- [ ] F5/Shift+H on an eligible climbing outbound track still initiates the
      existing handoff to `C`.
- [ ] Pending sender datablock is white, not blue.
- [ ] Receiver TCP `C` is visible in the existing Field 4 position.
- [ ] Datablock remains a full datablock with unchanged fields and geometry.
- [ ] Any blue position/ownership stub remains separate from datablock text.
- [ ] Core handoff state and session events remain unchanged.
- [ ] No new handoff, SPC, alert, sector, or networking behavior is added.
- [ ] Manual review uses only the supplied PDF and records §5.1.9 and p. 5-4.

## Tests

- `src/scope/test/starsFidelity.integration.test.ts`
- `src/scope/test/ownership.test.ts` if needed for color separation.
- Focused scope tests, then `npm run ci` after merge.

## Non-goals

- Automatic acceptance by Center; that is T02-136.
- Changes to `src/core/handoff.ts` state semantics.
- Second-sector simulation, networking, pointouts, quicklook, new SPCs,
  new alerts, parser, Command IR, speech, or DCB.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, with changed paths,
progressive commits, focused test results, and manual visual leftovers.
