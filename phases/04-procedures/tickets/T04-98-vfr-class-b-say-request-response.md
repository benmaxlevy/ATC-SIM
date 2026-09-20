# T04-98 VFR Class B `say request` response

**Phase:** 04 Procedures (VFR Class B pilot requests)
**Priority:** P0
**Size:** M
**Depends on:** T04-97
**Blocks:** T04-100
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Extend the existing `REQUEST_DETAILS`/`say request` response so a pending VFR
Class B request produces a complete, deterministic pilot transmission. The
response reports intent; it never authorizes Class B entry.

## Product law

- `REQUEST_DETAILS` remains the existing Command IR instruction.
- `say request` responds immediately; the pilot never parrots `say request`.
- Details include current position, aircraft type, altitude, direction, and the
  stored Class B request intent.
- Arrival `TO_ENTER` includes destination when available.
- `THROUGH` includes catalog-grounded route when available.
- Underlying-airport departures may include origin and destination.
- `OUT_OF` is never rendered as a pilot request.
- `STANDBY_REQUEST` remains a deferral, not approval.
- `say request` has no aircraft movement, route, flight-rule, service, beacon,
  or Class B authorization side effect.

## Research

- **R01:** FAA JO 7110.65 §2-1-18, approval, denial, and standby semantics:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_1.html
- **R02:** FAA JO 7110.65 §7-9-2, Class B clearance is separate from the request:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_9.html
- **R03:** FAA AIM §3-5-7, position/altitude/route/direction for transition routes:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap3_section_5.html
- **R04:** FAA AIM §4-2-3, initial-contact request content:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap4_section_2.html

Trainer delta: the generated sentence is deterministic simulator text, not a
claim that FAA prescribes this exact field order.

## Response contract

Use one shared formatter for `handleRadioText` and any queue compatibility
path. Canonical field order:

```text
<callsign>, <position>, <aircraft type>, <altitude>, <direction>, <request phrase> [to/toward <destination>] [via <route>]
```

Examples:

```text
N12345, 15 miles west of KATL, Cessna 172, 3500, eastbound, request VFR arrival into Bravo to KATL
N12345, 10 miles south of PDK, Cessna 172, 2500, northbound, request transition through Bravo via FIX1 then FIX2
```

Omit unavailable optional fields without empty commas or invented values.
Normalize `TO_ENTER` arrival to “VFR arrival into Bravo”, `TO_ENTER` departure
to “VFR departure into Bravo”, and `THROUGH` to “transition through Bravo”.

## Lifecycle and side effects

- `REQUEST_DETAILS` accepts an open `CLASS_B_ACCESS` request in `PENDING`,
  `AWAITING_DETAILS`, or `STANDBY`.
- It emits `vfr.request.details_reported`, returns the formatted text, and
  returns status to `PENDING` after details are reported, matching T04-85.
- `STANDBY_REQUEST` transitions an open request to `STANDBY`; it does not
  approve, decline, clear, or alter the aircraft.
- `CLEARED` requests cannot be reported again.
- `OUT_OF` controller clearance does not create or resolve a pilot request.

## Acceptance contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `say request` with `TO_ENTER` arrival | Direct pilot response with position, type, altitude, destination, and Bravo entry intent | Details event; request returns to `PENDING`; no authorization | No open request → `REQUEST: no pending radio request` | R02 §§2-1-18, 7-9-2 |
| `say request` with `THROUGH` transition | Direct response with route/direction and transition intent | Details event; no aircraft or Class B state change | Missing route → omit only unavailable optional route; never invent fix | R03 §3-5-7 |
| `say request` with underlying-airport departure | Direct response includes departure intent and available origin/destination | Request remains pending | No origin data → omit origin cleanly | R03 §3-5-7 |
| `stand by` / `standby` | Existing `STANDBY_REQUEST` behavior | `PENDING`/`AWAITING_DETAILS` → `STANDBY` | Terminal request → `REQUEST: request is already resolved` | R01 §2-1-18 |
| `say request` after standby | Direct response once | `STANDBY` → `PENDING` | Withdrawn/declined/cleared → exact existing no-open/resolved error | R01 §2-1-18 |
| `say request` for a controller-only `OUT_OF` action | No pilot request response | No new request | No `OUT_OF` request may exist | R02 §7-9-2 |
| `say request` bundled with another instruction | Reject whole transmission | No status or aircraft mutation | Existing `request control instruction must be the only instruction` | Existing parser contract |

## Tests and files

- Update `src/pilot/handleRadioText.ts` and `src/pilot/vfrRequestQueue.ts`.
- Add formatter/state tests in `src/pilot/test/handleRadioText.test.ts` and
  `src/pilot/test/vfrRequestQueue.test.ts`.
- Add synthetic lifecycle coverage to
  `tests/integration/vfr-class-b-request-acceptance.test.ts`.
- Preserve T04-85 flight-following and IFR-pickup output exactly.
- Verify no new speech parser or Command IR discriminant is needed here;
  `REQUEST_DETAILS` remains supported by typed, Path A, Path B, Path C, and PTT
  through its existing contract.

## Acceptance criteria

- [ ] Class B `say request` returns one direct pilot transmission with current
  position and stored request details.
- [ ] Arrival, transition, and underlying-airport departure wording is
  deterministic and omits unavailable optional fields cleanly.
- [ ] `say request` and `stand by` preserve the approved lifecycle without
  authorizing Class B entry.
- [ ] No Class B `OUT_OF` pilot request can be rendered.
- [ ] Existing flight-following and IFR-pickup `say request` output remains
  unchanged.

## Help/docs

T04-100 owns user-facing help updates. This ticket must provide formatter
examples and event names for `docs/USER.md`, `src/scope/keymap.ts`, and the
phase README to consume.

## Out of scope

- `CLEARED AS REQUESTED`, `UNABLE CLASS B CLEARANCE`, and parser parity (T04-99).
- Clearance execution, denial resolution, and `CLEARED` transition (T04-100).

## Handoff

Return exactly `READY TO MERGE` or `BLOCKED`, including focused tests, output
examples, no-side-effect evidence, and changed paths.
