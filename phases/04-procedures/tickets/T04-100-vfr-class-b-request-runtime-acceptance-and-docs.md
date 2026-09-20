# T04-100 VFR Class B request runtime, acceptance, and documentation

**Phase:** 04 Procedures (VFR Class B pilot requests)
**Priority:** P0
**Size:** L
**Depends on:** T04-98, T04-99
**Blocks:** None
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start a later ticket or phase.

## Goal

Connect Class B pilot requests to the existing controller clearance state,
implement approval/denial/standby lifecycle, and prove the complete VFR-only
workflow. Update help, user docs, phase docs, and the existing Class B backlog
subsection.

## Product law

- An open Class B request is informational until an accepted controller
  clearance exists.
- Accepted `TO_ENTER`/`THROUGH` clearances resolve a matching open request to
  `CLEARED` and use existing Class B execution/geometry validation.
- `CLEARED AS REQUESTED` copies only the pending request's `TO_ENTER` or
  `THROUGH` operation, route, and requested altitude.
- `UNABLE CLASS B CLEARANCE` and `REMAIN OUTSIDE BRAVO AIRSPACE` decline a
  pending request; neither authorizes entry.
- `STAND BY` leaves the request open in `STANDBY`; it is not approval or denial.
- `OUT_OF` remains controller-issued and never creates or resolves a pilot
  request.
- Every accepted Class B command requires operational VFR and preserves VFR,
  flight plan, service, beacon, radar-contact, and unrelated intent state.
- Rejected commands mutate nothing.
- Existing FAA-required `LEAVING (name) BRAVO AIRSPACE` behavior remains; no
  new pilot exit notification is added.

## Research

- **R01:** FAA JO 7110.65 §7-9-2, VFR Class B clearances, approve/deny, and
  leaving notification:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_9.html
- **R02:** FAA JO 7110.65 §7-9-3, Class B vectors and leaving/reentry:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_9.html
- **R03:** FAA JO 7110.65 §2-1-18, operational-request approval, denial, and
  standby:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_1.html
- **R04:** FAA AIM §3-2-3, Class B arrival/transit/departure:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap3_section_2.html

Trainer delta: request-to-clearance association is local single-position
simulator state, not live facility coordination. `CLEARED AS REQUESTED` is
supported only when an open Class B request supplies the requested operation.

## Runtime transitions

| Controller input | Request transition | Clearance behavior |
| --- | --- | --- |
| `REQUEST_DETAILS` | `PENDING`/`STANDBY` → `PENDING` after response | No authorization |
| `STANDBY_REQUEST` | Open request → `STANDBY` | No authorization |
| `DECLINE_REQUEST CLASS_B_ACCESS` | Open request → `DECLINED` | No aircraft mutation |
| `REMAIN_OUTSIDE_BRAVO` | Open request → `DECLINED` when command is accepted outside | Preserve no-entry restriction |
| Explicit accepted `TO_ENTER`/`THROUGH` | Open request → `CLEARED` | Apply existing Class B clearance state |
| `CLASS_B_CLEARANCE_AS_REQUESTED` | Open `TO_ENTER`/`THROUGH` → `CLEARED` | Apply stored operation/route/altitude |
| `OUT_OF` | No request transition | Apply existing controller-issued exit behavior |

If an explicit `TO_ENTER`/`THROUGH` clearance is issued with restrictions that
differ from the request, record the actual controller clearance in `CLEARED`;
do not force the aircraft to fly the requested route. If no request exists,
explicit Class B clearance behavior remains unchanged. `CLEARED AS REQUESTED`
without an open Class B request rejects exactly:
`REQUEST: no pending Class B request`.

## Side-effect and association rules

- Associate by aircraft id and open `CLASS_B_ACCESS` request only.
- Never associate a Class B clearance with flight-following or IFR-pickup
  requests.
- `CLEARED AS REQUESTED` requires a request operation of `TO_ENTER` or
  `THROUGH`; an impossible/expired request rejects atomically.
- A cleared request is excluded from future `say request`, duplicate, and cap
  handling.
- `UNABLE`/`REMAIN OUTSIDE` may close the request but never alter flight rules,
  route, plan, service, beacon, or kinematics.
- Existing Class B geometry, altitude, boundary, conformance, and VFR-only
  validation remain the source of truth.

## Acceptance contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| VFR pending `TO_ENTER` + accepted explicit `CLEARED TO ENTER` | Authorize entry | Request `CLEARED`; existing Class B state active; VFR preserved | Invalid 3D route/altitude → existing `CLEARANCE` error; request remains unresolved | R01 §7-9-2 |
| VFR pending `THROUGH` + accepted explicit `CLEARED THROUGH` | Authorize transition | Request `CLEARED`; route executes | Route does not satisfy operation → atomic rejection | R01 §§7-9-2/3 |
| VFR pending request + `CLEARED AS REQUESTED` | Apply stored operation/route/altitude | Request `CLEARED`; existing state transaction | No request or request is `OUT_OF`/terminal → `REQUEST: no pending Class B request` | R01 §§2-1-18, 7-9-2 |
| VFR pending request + `UNABLE CLASS B CLEARANCE` | Decline request | Request `DECLINED`; aircraft remains outside | No open Class B request → `REQUEST: no pending radio request` | R01 §2-1-18 |
| VFR pending request + `REMAIN OUTSIDE BRAVO AIRSPACE` | Keep aircraft clear and decline request | Existing no-entry restriction; request `DECLINED` | Inside Bravo → existing `CLEARANCE: aircraft is inside Class B airspace` | R01 §7-9-2 |
| VFR pending request + `STAND BY` | Defer response | Request `STANDBY`; no authorization | Terminal request → `REQUEST: request is already resolved` | R01 §2-1-18 |
| Controller `CLEARED OUT OF BRAVO AIRSPACE` | Existing exit behavior | No Class B pilot request created/resolved; VFR preserved | Outside Bravo → existing clearance rejection | R01 §7-9-2 |
| IFR aircraft receives any Class B request/clearance action | Reject Class B operation | No request/clearance/flight-rule mutation | Exact existing `CLEARANCE: VFR aircraft required` | R01 §7-9-2 |
| Aircraft crosses Bravo boundary after accepted clearance | Existing entry/exit events and FAA exit notice | No automatic radar termination or squawk reset | No authorization remains blocked by existing no-entry guard | R01 §§7-9-2/3 |

## Integrated tests

Use one synthetic acceptance file:
`tests/integration/vfr-class-b-request-acceptance.test.ts`.

Cover:

- inbound VFR arrival requesting `TO_ENTER`;
- VFR `THROUGH` transition;
- departure from an airport below a Bravo shelf requesting entry/transition;
- flight remaining below the shelf with no request;
- primary-airport departure with no pilot `OUT_OF` request;
- `say request` → standby → say request;
- explicit clearance, `CLEARED AS REQUESTED`, `UNABLE`, and remain-outside;
- request terminal state, duplicate/capacity behavior, and association;
- all commands remaining VFR and preserving unrelated state;
- typed, Path A, Path B, Path C, PTT, and GBNF parity through the parser
  contract from T04-99;
- existing Class B exit notification and no automatic service/squawk changes.

## Acceptance criteria

- [ ] Open Class B requests resolve only through accepted `TO_ENTER`/`THROUGH`
  clearance, `CLEARED AS REQUESTED`, explicit `UNABLE`, or accepted
  `REMAIN OUTSIDE` behavior.
- [ ] `STAND BY` remains non-terminal and does not authorize entry.
- [ ] `OUT_OF` never creates or resolves a pilot request.
- [ ] All accepted Class B behavior remains operationally VFR and preserves
  unrelated state.
- [ ] Typed, Path A, Path B, Path C, PTT, and GBNF integrated behavior is
  covered by the preceding parity contract.
- [ ] Help, user docs, phase README, shared docs, and existing Class B backlog
  subsection are updated without a duplicate backlog entry.
- [ ] Focused acceptance, `npm run ci`, speech mock pytest, diff check, and FAA
  manual review are complete.

## Help/docs/backlog

Update:

- `docs/USER.md` — pilot request examples and KATL/underlying-airport rules;
- `phases/04-procedures/README.md` — completed Class B request behavior;
- `phases/LATER-IMPLEMENTATION-BACKLOG.md` — extend the existing Class B
  subsection, documenting no remaining request behavior from this slice.

## Manual review checklist

- Re-read JO 7110.65 §§2-1-18, 7-9-2, and 7-9-3 against command/readback
  strings and request lifecycle.
- Re-read AIM §§3-2-3, 3-5-7, and 4-2-3 against arrival, transition, and
  underlying-airport generated requests.
- Confirm `OUT_OF` remains controller-only and primary-airport departure is not
  represented as a pilot `OUT_OF` request.
- Confirm no docs claim FAA certification or exact FAA-generated sentence order.

## Gates and handoff

- Focused integration/parser tests.
- `npm run ci`.
- `cd speech-api && SPEECH_API_MOCK=1 pytest` because speech parser files change.
- `git diff --check`.
- Return exactly `READY TO MERGE` or `BLOCKED`, with manual evidence status.
