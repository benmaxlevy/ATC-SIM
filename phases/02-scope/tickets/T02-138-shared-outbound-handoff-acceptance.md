# T02-138 Shared Outbound Handoff Acceptance

**Phase:** 02 Scope — handoff/datablock fidelity  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-137  
**Blocks:** T02-139  
**Launch:** Implement this ticket only. Stop after focused tests and CI.

## Mission

Use one five-simulated-second automatic acceptance path for outbound handoffs
to Center `C` and Tower. This is a trainer simulation of the receiving
position accepting; it is not a network or multi-controller model.

## Research

User-supplied `TI 6191.409 Rev. 30`:

- General Rules, p. 5-4: accepted handoff attention and receiver-position
  display have defined timed behavior.
- §5.1.10, p. 5-20: acceptance is performed by the receiving position.

Repository finding: Center `C` already has a five-simulated-second timer that
calls `acceptOutboundHandoff()`. Tower currently applies landing/ownership
effects at initiation, so the shared path must move those effects behind
acceptance without changing unrelated landing behavior.

## Scope

- Generalize the current five-simulated-second pending deadline to the
  destination-aware outbound state created by T02-137.
- Invoke the shared acceptance function exactly once per pending handoff.
- Preserve existing Center acceptance event/state behavior.
- Apply Tower-specific landing/ownership effects only after Tower acceptance.
- Preserve the accepted timestamp, session events, aircraft movement, and
  explicit return-to-unowned control.
- Keep the existing accepted UI timing for the next UI ticket.

## Acceptance criteria

- [ ] Center `C` remains pending until five simulated seconds, then follows
      the existing acceptance path exactly once.
- [ ] Tower remains pending until five simulated seconds, then follows the
      same acceptance path exactly once with the Tower destination.
- [ ] Tower landing/ownership effects occur only after automatic acceptance,
      never at initiation.
- [ ] Repeated world steps cannot duplicate acceptance or session events.
- [ ] Existing Center accepted timestamp and event behavior remains intact.
- [ ] Explicit return-to-unowned still works after either destination accepts.
- [ ] No networking, second-sector model, new handoff type, SPC, alert,
      parser, Command IR, speech, DCB, pointout, quicklook, or facility
      branch is added.

## Tests

- `src/core/test/handoff.test.ts`
- `src/core/test/world.test.ts` or the existing world-step timer seam
- `src/scope/test/ownership.test.ts`
- Add parameterized C/Tower timing and exactly-once acceptance coverage.
- Run focused tests, then `npm run ci` after merge.

## Non-goals

- Real receiving-controller/network behavior.
- New handoff destinations or multi-position simulation.
- Datablock rendering/layout changes; T02-139.
- Pointouts, quicklook, new SPCs, new alerts, parser, Command IR, speech,
  DCB, or unrelated landing behavior.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, with changed paths,
progressive commits, focused test results, and unresolved scope concerns.
