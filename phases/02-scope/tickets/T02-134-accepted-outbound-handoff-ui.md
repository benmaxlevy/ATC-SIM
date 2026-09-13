# T02-134 Align Accepted Outbound Handoff Datablock UI

**Phase:** 02 Scope — datablock fidelity  
**Priority:** P0  
**Size:** S  
**Depends on:** T02-133  
**Blocks:** none  
**Launch:** Implement this ticket only. Stop after acceptance and manual review.

## Mission

Align the visible outbound handoff datablock sequence with the supplied
TI 6191.409 Rev. 30 manual while preserving the existing trainer handoff
logic, including handoff to Center sector `C` and outbound acceptance events.

## Research

User-supplied `TI 6191.409 Rev. 30`:

- General Rules, p. 5-4: after acceptance, the sender displays a white
  Owned / Previously Owned FDB; the receiver TCP remains for five seconds.
- §5.1.9, pp. 5-18–19: initiating a handoff shows the intended receiver ID;
  the receiver sees a blinking white FDB.
- §5.1.10, p. 5-20: acceptance makes the receiving position the owner,
  removes the receiving TCP at the receiver, and leaves the sender with a
  white FDB until the datablock is explicitly returned to unowned color.

Repository finding: `acceptOutboundHandoff()` already records the accepted
state and timestamp. The scope currently flashes for five seconds, but keeps
the receiving TCP indefinitely and uses a three-click UI progression to move
from accepted white FDB to green FDB/PDB. This ticket aligns that presentation
only; it does not add a second simulated position.

## Scope

- Keep `src/core/handoff.ts` handoff state, acceptance, logging, and `C`
  routing unchanged.
- Keep accepted outbound tracks as white FDBs.
- Show the receiver TCP for five seconds after acceptance, then remove it from
  the sender’s datablock.
- Preserve the existing five-second accepted blink, then settle to solid white.
- Remove the accepted-handoff three-click visual progression from normal track
  selection; do not automatically change the accepted track to green FDB/PDB.
- Preserve existing FDB Field 0, Field 2, physical lines, leader, hitbox,
  overlap layout, and altitude-filter behavior.
- Preserve explicit trainer controls that are outside accepted-handoff display
  timing, if they do not mutate core handoff acceptance.

## Acceptance criteria

- [ ] Initiating handoff to `C` still sets the existing outbound handoff state
      and displays the receiver ID.
- [ ] Accepted outbound handoff remains a white FDB and blinks for five seconds.
- [ ] Receiver TCP is visible during the five-second post-acceptance interval.
- [ ] Receiver TCP is absent after that interval.
- [ ] The accepted track remains a white FDB after TCP removal.
- [ ] Selecting the accepted track does not automatically produce the old
      green FDB/PDB progression.
- [ ] Existing handoff logs, aircraft movement, boundary despawn, Field 0,
      Field 2, leaders, hit testing, and layout remain intact.
- [ ] No second sector/position model is added.
- [ ] Manual review uses only the supplied PDF and records p. 5-4 and
      §§5.1.9–5.1.10 findings.

## Tests

- `src/scope/test/starsFidelity.integration.test.ts`
- `src/core/test/handoff.test.ts` only if regression coverage is needed.
- Focused scope/handoff tests, then `npm run ci` after merge.

## Non-goals

- Changing `src/core/handoff.ts` acceptance semantics or handoff routing.
- Simulating a second live sector or receiver-side World.
- New handoff types, networking, pointout, quicklook, or automatic ownership
  transfer beyond existing logic.
- New SPCs, alerts, parser behavior, Command IR, speech, or DCB behavior.
- Full STARS/NAS compatibility.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, with changed paths,
progressive commits, focused test results, and manual visual leftovers.
