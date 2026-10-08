# T04-103 Contact Tower/Center integrated acceptance and documentation

**Phase:** 04 Procedures (communications-transfer addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-102
**Blocks:** none
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Stop at the Phase 4 addendum boundary.

## Mission

Prove the complete Contact Tower/Center slice across controller input, parser
parity, transfer gates, generic landing/center behavior, flight-plan closure,
readback, user surfaces, and FAA evidence. Keep the trainer delta explicit:
facility names are not live facilities, frequencies are absent, and no
Raytheon STARS functionality is added.

## Research

- FAA JO 7110.65 §7-6-8, VFR control transfer:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_6.html
- FAA JO 7110.65 §2-1-15/16/17, control, surface-area, and communication
  transfer:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_1.html
- FAA AIM §5-1-14/15, VFR/DVFR and IFR plan closure:
  https://www.faa.gov/air_traffic/publications/aim_html/chap5_section_1.html
- FAA JO 7110.65 §5-1-9, radar-service termination:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_1.html

## Scope

Add one integrated acceptance file using synthetic parameterized aircraft and
airport metadata. Update Help, `docs/USER.md`, phase README, shared Command IR
and parse-pipeline contracts, and any relevant user-facing readback text.

The acceptance file must prove:

1. Both commands parse identically through typed, Path A, Path B, Path C, PTT,
   and speech mock routes.
2. Eligible IFR/VFR tower transfers use existing generic landing behavior.
3. Eligible outbound center transfer preserves route and operational state.
4. Ineligible arrival/departure/transit commands reject atomically.
5. IFR towered landing closes the plan only at `nav.landed` while retaining
   read-only history and removing active correlation.
6. VFR/DVFR and non-towered IFR plans remain open.
7. Contact transfer does not terminate radar service, alter beacon, change
   flight rules, or authorize Class B.

## Acceptance contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Typed `CONTACT ATLANTA TOWER` | Tower IR and runtime result match speech route | Channel-independent state | Path mismatch fails parity guard | JO §2-1-17 |
| Typed `CONTACT ATLANTA CENTER` | Center IR and runtime result match speech route | Channel-independent state | Path mismatch fails parity guard | JO §2-1-17 |
| Eligible VFR airport-bound tower transfer | Visual final, touchdown, despawn | VFR remains VFR; VFR plan remains open | No terminal gate rejects atomically | JO §7-6-8; T04-83 |
| Eligible IFR tower transfer and landing | Existing landing lifecycle completes | IFR plan closes only at touchdown | Contact command alone does not close | AIM §5-1-15 |
| IFR landing at non-towered destination | Landing completes | Plan remains open for pilot cancellation | No automatic close | AIM §5-1-15; JO §4-2-10 |
| VFR/DVFR landing at towered destination | Landing completes | Plan remains open | Tower does not auto-close VFR/DVFR | AIM §5-1-14 |
| Center transfer for outbound aircraft | Generic center transfer | Route/track/flight rules/plan/beacon preserved | No auto-land or plan close | JO §2-1-15 |
| Contact plus frequency or second command | No command executes | No side effect | Parse miss/atomic rejection | Scope contract |
| Contact during active radar service | Transfer only | Radar marker unchanged | Termination remains separate | JO §5-1-9 |

## Acceptance criteria

- [ ] One synthetic integrated acceptance file covers the full command-to-landing
  and command-to-center-transfer lifecycle.
- [ ] Help overlay, `docs/USER.md`, phase README, and shared command/parse docs
  state exact no-frequency forms and trainer limitations.
- [ ] Acceptance asserts VFR preservation and no implicit Class B authorization.
- [ ] Acceptance asserts IFR landing closure timing, VFR/non-towered exceptions,
  retained history, active-view removal, and no reopen.
- [ ] No Raytheon STARS manual or feature work is added.
- [ ] `npm run ci`, speech mock pytest, focused tests, and `git diff --check`
  pass.

## Test plan

- Integration: typed controller input through `nav.landed`/center transfer.
- Parity: frontend and speech API closed-union/eval guard.
- Regression: Class B, T04-20 handoff, T04-73 service, T04-75 cancellation,
  and T04-83 auto-land suites.
- Manual checklist: verify exact readbacks; no frequency; transfer gate before
  landing; VFR remains VFR; IFR towered plan closes only after touchdown;
  VFR/non-towered IFR plan remains available; no STARS behavior.

## Non-goals

- New command families, pilot requests, facilities, frequencies, tower cab,
  ground traffic, STARS functionality, or phase 5.

## Handoff

Return `READY TO MERGE` only with focused tests, full CI, speech mock pytest,
diff hygiene, and FAA manual evidence recorded. Return `BLOCKED` with exact
missing evidence or failed gate otherwise.
