# T02-136 Simulated Center Handoff Acceptance

**Phase:** 02 Scope — handoff/datablock fidelity  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-135  
**Blocks:** none  
**Launch:** Implement this ticket only. Stop after acceptance and manual review.

## Mission

Simulate Center `C` accepting an initiated outbound handoff after five
simulated seconds, using the existing acceptance function and preserving the
manual-aligned sender UI.

## Research

User-supplied `TI 6191.409 Rev. 30`:

- General Rules, p. 5-4: after acceptance the sender FDB flashes white for
  five seconds, remains white, and shows the receiver TCP for five seconds.
- §5.1.10, p. 5-20: acceptance is a receiver action; the sender retains a
  white FDB until explicit return to unowned color.

Trainer delta: this single-position trainer has no live receiving sector, so
Center `C` accepts automatically after five simulated seconds. The resulting
display sequence remains manual-aligned. This timer must not claim to model a
real network or second controller.

## Scope

- Detect an initiated outbound handoff to `C` that has remained pending for
  five simulated seconds.
- Call existing `acceptOutboundHandoff()` exactly once.
- Preserve existing accepted timestamp/session event behavior.
- Keep the sender FDB white and apply the existing five-second accepted flash
  and five-second receiver-TCP display window.
- Keep the sender white FDB after the window until explicit return control.
- Prevent duplicate automatic acceptance and preserve aircraft lifecycle.

## Acceptance criteria

- [ ] F5 initiates the existing outbound handoff to `C`.
- [ ] Pending handoff remains pending until five simulated seconds elapse.
- [ ] Center acceptance occurs exactly once at the five-second deadline.
- [ ] Existing `handoff.outbound.accepted` logging remains correct.
- [ ] Post-acceptance sender FDB blinks white for five seconds.
- [ ] Receiver TCP `C` remains visible for those five seconds, then disappears.
- [ ] Sender remains a solid white FDB afterward.
- [ ] Explicit F4/return-to-unowned still works afterward.
- [ ] No second position, networking, new handoff type, SPC, or alert is added.
- [ ] Manual review uses only the supplied PDF and records p. 5-4 and
      §5.1.10 findings.

## Tests

- `src/core/test/handoff.test.ts`
- `src/scope/test/starsFidelity.integration.test.ts`
- Relevant world-step test seam for the five-second timer.
- Focused handoff/scope tests, then `npm run ci` after merge.

## Non-goals

- Real remote-controller or multi-position simulation.
- Network/Data Accept messages.
- Changing `initiateCenterHandoff()` or `acceptOutboundHandoff()` semantics.
- Pointouts, quicklook, new SPCs, new alerts, parser, Command IR, speech, DCB,
  or unrelated datablock behavior.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, with changed paths,
progressive commits, focused test results, and manual visual leftovers.
