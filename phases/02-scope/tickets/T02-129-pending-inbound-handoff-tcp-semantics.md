# T02-129 Pending Inbound Handoff TCP Semantics

**Phase:** 02 Scope — datablock fidelity  
**Priority:** P0  
**Size:** M  
**Depends on:** T02-128  
**Blocks:** T02-130  
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Mission

Align pending inbound handoff presentation with TI 6191.409 Rev. 30 Figures
2-20 and 2-22, while preserving the trainer's single-scope handoff model.

## Research

- User-provided `TI 6191.409 Rev. 30`, pp. 2-58 and 2-66–70: pending inbound
  arrivals use an FDB; Field 4 carries the adapted TCP/origin indication; the
  receiving position owns the target symbol after acceptance.
- R07, [CRC STARS](https://docs.virtualnas.net/crc/stars/): accepting an
  inbound handoff changes the position symbol to the receiving controller and
  turns the datablock white; FDB Line 2 time-shares altitude/scratchpad,
  handoff TCP, and GS/type/requested altitude.
- R05, [FAA FOA STARS](https://www.faa.gov/air_traffic/publications/atpubs/foa_html/chap12_section_6.html):
  source for STARS display terminology and policy context, not a pixel spec.

Trainer delta: no networking, second live controller, redirect protocol, or
NAS compatibility claim. `fromSectorId` remains the generic originating
facility/sector value; the local receiving TCP comes from the active scope
view.

## Scope

- Separate inbound originating value from local receiving TCP in the render
  adapter.
- Use the local receiving TCP for the inbound target position symbol.
- Pass the originating value through the generic Field 4/TCP path.
- Remove the invented inbound `HO` suffix from FDB Line 1.
- Preserve `PO` pointout indicators and existing departure/outbound behavior.
- Keep pending inbound FDB blinking and altitude-filter retention unchanged.
- Avoid facility-specific branches; synthetic fixtures use arbitrary TCPs.

## Acceptance criteria

- [ ] **AC1 —** Pending inbound from origin `C` on local TCP `D` renders the
  target symbol as `D`, not `C`.
- [ ] **AC2 —** The same pending inbound renders origin `C` in Field 4 and in
  the physical Line 2 center slot.
- [ ] **AC3 —** Pending inbound no longer appends literal `HO` to Line 1.
- [ ] **AC4 —** Click/F3 acceptance clears pending state, keeps the FDB solid
  white, and leaves the receiving TCP as the target symbol.
- [ ] **AC5 —** Pointout `PO` rendering and acceptance are unchanged.
- [ ] **AC6 —** Synthetic tests cover one-character and two-character TCPs and
  do not depend on KDEM production identifiers.

## Tests

- Extend `src/scope/test/datablockFidelity.integration.test.ts` for logical and
  physical Field 4 consistency.
- Extend `src/scope/render/test/renderScope.test.ts` for pending/accepted
  inbound symbol and FDB output.
- Extend `src/scope/test/pick.test.ts` or the existing handoff acceptance seam
  only if the click transition needs coverage.

## Non-goals

- Full physical-line reflow for every Field 0–8 value; T02-130 owns that.
- New handoff state types, networking, redirect/recall, parser, Command IR,
  speech, DCB, scenario data, or facility branches.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, with changed paths,
progressive commits, focused test results, and any unresolved trainer delta.
