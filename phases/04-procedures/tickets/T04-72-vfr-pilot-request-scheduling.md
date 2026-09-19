# T04-72 VFR pilot request scheduling and cancellation candidates

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-71
**Blocks:** T04-73, T04-74, T04-75
**Launch:** Implement this ticket only after T04-71 is merged. Do not start controller-command or IFR-transition work from this ticket.

## Mission

Schedule unsolicited **airborne VFR** pilot calls for flight following and
airborne IFR pickups. Flight-following and IFR-pickup percentages are separate,
mutually exclusive selection outcomes; a combined simulated-time request cap
paces both streams. Schedule a later pilot-initiated IFR-cancellation report
for eligible accepted pickups using a separate percentage. The scheduler emits
structured radio events and never performs controller handling.

This ticket supplies request payloads to T04-73/T04-74. It does not invent or
own typed/spoken controller command grammar, the SQ/IDENT/clearance shortcuts,
the controller approval/decline lifecycle, IFR state transition, or service
termination. T04-73 owns full request handling and radar-context phraseology;
T04-74 owns IFR pickup execution; T04-75 owns cancellation validation and
execution.

## Context and state boundary

`src/pilot/checkinQueue.ts` currently schedules STAR/SID check-ins with an
independent seeded stream and radio-busy gating. VFR requests are a separate
queue because they are not procedure check-ins and must not be mistaken for a
Command IR instruction or readback. `stepWorld` is the only simulation-clock
writer; no wall-clock timer or random draw is allowed.

Each T04-71 ambient aircraft has an explicit VFR marker. Request scheduling may
create a request record, but it must not conflate the following independent
states (T04-73/T04-74 will transition them later):

| State | Initial ambient value | Owned by this ticket |
| --- | --- | --- |
| Radio request delivery | none | Queue record only; transmit once |
| Radio contact | not contacted | No operational mutation |
| Radar identification | unknown | No IDENT/association |
| Service | none | No flight-following/IFR service |
| Flight rules | VFR | Never changed here |
| Scope association | none | Never changed here |

The request record is the scheduler’s lifecycle, not a clearance or service
state:

```ts
type VfrPilotRequestKind = "FLIGHT_FOLLOWING" | "IFR_PICKUP";
type VfrPilotRequestState = "PENDING" | "TRANSMITTED" | "WITHDRAWN";

interface VfrPilotRequest {
  id: string;
  aircraftId: string;
  callsign: string;
  kind: VfrPilotRequestKind;
  createdAtSimMs: number;
  dueAtSimMs: number;
  state: VfrPilotRequestState;
  positionNm: { xNm: number; yNm: number };
  altitudeFt: number;
  headingDeg: number;
  aircraftType?: string;
  destinationAirportId?: string;
  requestedAltitudeFt?: number;
}
```

The payload is a snapshot at transmit time. Later aircraft motion does not
rewrite the historical request; T04-73 may obtain current state when handling
it. No exact pilot phrase is frozen here. A future formatter may use the
structured payload; it must not add Command IR grammar.

## Configuration contract

The scenario/session object uses an optional `vfrRequests` object. This is
separate from T04-71’s population controls so request workload never changes
aircraft entries/hour or target replenishment.

```ts
interface VfrRequestConfig {
  flightFollowingPercent?: number;
  ifrPickupPercent?: number;
  requestCapPerHour?: number;
  ifrCancellationPercent?: number;
}
```

Validation/default rules:

- Omitted `vfrRequests` means no generated service calls:
  `flightFollowingPercent: 0`, `ifrPickupPercent: 0`,
  `requestCapPerHour: 0`, and `ifrCancellationPercent: 0`.
- Omitted fields in a present object use the same zero defaults. Percentages
  are finite numbers in `[0,100]`; `requestCapPerHour` is finite and `>= 0`.
  `flightFollowingPercent + ifrPickupPercent` must be `<= 100`. The remaining
  percentage is intentionally silent ambient traffic.
- Exact validation errors are stable:
  - `vfrRequests.flightFollowingPercent must be in [0, 100]`
  - `vfrRequests.ifrPickupPercent must be in [0, 100]`
  - `vfrRequests.flightFollowingPercent + vfrRequests.ifrPickupPercent must be <= 100`
  - `vfrRequests.requestCapPerHour must be a finite number >= 0`
  - `vfrRequests.ifrCancellationPercent must be in [0, 100]`

## Selection, pacing, and lifecycle

- On each eligible ambient VFR spawn, draw one request outcome from an
  independent `vfrRequests` stream: flight following, IFR pickup, or silent.
  The two request percentages are exclusive; an aircraft never receives both
  initial calls. A request outcome is drawn once and is not re-rolled because
  the frequency is busy or the cap is full.
- Only airborne VFR aircraft with `flightRules === "VFR"`, no active IFR
  clearance, and an existing ambient marker are eligible. Ground aircraft,
  existing IFR arrivals/departures, authored/non-ambient VFR, aircraft already
  assigned a request, and aircraft that have naturally exited are ineligible.
- A flight-following payload includes callsign, current position, altitude,
  heading, aircraft type when known, and intended destination when known. An
  IFR-pickup payload includes those fields plus an imported eligible destination
  airport and a seeded requested altitude in the existing clearance altitude
  domain. It does not create a flight plan, route, beacon assignment, or
  clearance. Destination and altitude selection must use T04-70 catalog/profile
  data; no KATL literal or hand-authored airport is allowed.
- The combined `requestCapPerHour` is enforced with simulated-time admission
  spacing (`3_600_000 / cap` milliseconds), not a wall-clock interval and not a
  top-of-hour reset. The first eligible slot has a bounded seeded offset. A cap
  of `0` disables new requests. Due candidates wait FIFO for the next slot;
  they are not dropped, duplicated, re-rolled, or released as a rollover burst.
  At most `cap` new request admissions occur in any rolling simulated hour.
- Radio busy/TTS state can delay delivery after admission. Existing STAR/SID
  check-ins retain their queue and stagger behavior. VFR requests never consume
  a cap token for controller replies, acknowledgements, declines, IDENT/squawk
  reports, service termination, or an IFR-cancellation report.
- A request is transmitted once, then becomes `TRANSMITTED`; the scheduler
  never repeats it. If its aircraft exits or becomes ineligible before
  delivery, mark it `WITHDRAWN` with a reason and do not replace it. Resetting
  the world clears pending records and restarts all streams from the configured
  seed; it must not leak stale aircraft IDs.
- The queue emits `vfr.request.transmitted` with the structured payload and
  request kind. T04-73/T04-74 decide whether the controller responds. A
  transmitted call alone does not set `maintainVfr`, assign a squawk, flash
  IDENT, identify radar, associate scope ownership, set flight following, or
  change flight rules.

## IFR cancellation candidate contract

- T04-74 calls a scheduler hook only after a valid airborne IFR pickup has been
  accepted and the aircraft has an active IFR clearance. The hook samples
  `ifrCancellationPercent` once for that pickup. A percentage of `0` never
  schedules a report; `100` schedules every otherwise eligible pickup.
- A selected candidate receives one seeded simulated delay and a
  `pilot.cancel_ifr.scheduled` record. At its due time the scheduler checks
  current state and imported airspace/VMC assumptions supplied by T04-75. The
  report is emitted only while the aircraft is still IFR, communicating, and
  outside a protected KATL Class B volume with a valid VFR continuation. T04-75
  owns those checks and the actual IFR-to-VFR transition.
- Cancellation reports are pilot reports, not controller commands and not new
  request-cap admissions. They must be delivered once when radio is available,
  never silently become a clearance cancellation, and never be generated for
  an aircraft already VFR, already terminated, or missing an active IFR state.
- If T04-75 rejects the candidate as unsafe/stale, record a deterministic
  `pilot.cancel_ifr.withdrawn` reason and do not retry or mutate aircraft state.
  Continued flight following, if desired, is a later controller-service choice;
  cancellation must not implicitly terminate or continue radar service.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Omitted `vfrRequests` | No VFR service requests are scheduled | Existing traffic/radio queues unchanged | No request cap tokens consumed | Config/unit test |
| `{ flightFollowingPercent: 30, ifrPickupPercent: 20, requestCapPerHour: 6 }` | Each eligible VFR spawn receives one seeded FF/IFR/silent draw | At most one pending request per aircraft | Sum >100 rejects exact error | Synthetic distribution test |
| FF draw for airborne VFR | Creates one `FLIGHT_FOLLOWING` payload with current call details | Request record only; no service/IDENT/squawk/plan mutation | Ground/IFR/non-ambient target is ineligible | Queue unit test |
| IFR draw for airborne VFR | Creates one `IFR_PICKUP` payload with imported destination and requested altitude | Request record only; remains VFR until T04-74 accepts clearance | Missing imported eligible destination withdraws with `NO_DESTINATION` | Catalog-backed synthetic test |
| Silent remainder (`50%` in the example) | Aircraft never calls for initial service | Remains ambient VFR | No retry caused by cap or radio busy | Seeded count test |
| `requestCapPerHour: 0` | No new request admission | Pending candidates remain disabled/withdrawn by documented policy | No top-of-hour burst | Cap test |
| Six-cap queue with seven due candidates | First six are admitted at paced sim slots; seventh waits | No burst and no re-roll; replies are uncapped | Aircraft exiting before slot is withdrawn | Sim-clock spacing test |
| Radio busy at due time | Queue retains admitted request until radio can transmit | One `vfr.request.transmitted` only | No duplicate call or new cap token | Mock-radio test |
| Aircraft exits before due | Withdraws request | No aircraft mutation; no replacement draw | Stale ID cannot transmit | Lifecycle test |
| Controller receives transmitted request | Downstream handler gets structured kind/payload | Scheduler state becomes `TRANSMITTED` only | Scheduler does not approve/decline/identify/assign | T04-73 integration contract |
| T04-74 reports accepted IFR pickup, cancellation `100%` | Schedules one delayed pilot cancellation candidate | No flight-rule or clearance mutation yet | No active IFR at due time withdraws | Hook/lifecycle test |
| Cancellation due outside KATL Bravo with valid VFR continuation | Emits one pilot cancellation report | Does not consume new-request cap; T04-75 owns transition | Unsafe/stale candidate withdraws exact reason | T04-75 handoff test/manual review |
| Cancellation report after IFR cancellation | No automatic service termination or new FF request | Flight rules/service/scope remain downstream-owned | Already-VFR duplicate report rejected/withdrawn | State-separation test |

## Acceptance criteria

- [ ] `vfrRequests` is optional, defaults all controls to zero, validates exact
  ranges/sum, and remains separate from T04-71 population/entry controls.
- [ ] Eligible airborne ambient VFR aircraft receive one exclusive seeded
  flight-following/IFR-pickup/silent outcome; no ground or existing IFR target
  generates a request.
- [ ] Structured request payloads contain current position/callsign/altitude/
  heading plus type/destination fields where applicable, and use imported
  destination/profile data only.
- [ ] Combined new-request cap uses simulated time and paced admission with no
  rollover burst, duplicate, re-roll, or mass target replenishment.
- [ ] Radio-busy delay and world reset are deterministic; each call transmits
  once or withdraws cleanly. Existing procedure check-in queue behavior stays
  unchanged.
- [ ] Transmitting a request does not mutate radio contact, identification,
  service, flight rules, scope association, flight plan, clearance, beacon, or
  controller intent state.
- [ ] Accepted IFR pickups can schedule one independent pilot cancellation
  candidate using `ifrCancellationPercent`; cancellation reports bypass the
  new-request cap and never auto-change IFR/service state.
- [ ] Generic tests cover positive, silent, malformed, percentage-conflict,
  cap-zero, cap-full, busy-radio, duplicate, stale-aircraft, reset, and
  cancellation eligibility paths. No exact controller command grammar is added.

## Test plan

- Unit: `src/pilot/test/vfrRequestQueue.test.ts` with synthetic VFR aircraft,
  deterministic seeds, distribution, config, cap spacing, radio busy, stale
  withdrawal, and reset cases.
- Integration: `tests/integration/vfr-request-scheduling.test.ts` proving the
  queue receives T04-71 spawns, leaves operational state untouched, and emits
  one structured event per transmitted request.
- Cancellation hook: test accepted-IFR callback, percentages `0`/`100`, stale
  VFR/inside-volume withdrawal, no-cap-token accounting, and no auto-terminate.
- Regression: existing `src/pilot/test/checkinQueue.test.ts`, radio handling,
  IFR clearance, and world tests remain green.
- Manual: verify a seeded KATL session produces airborne-only calls, no request
  burst when the frequency is busy, and one pilot cancellation report outside
  imported Bravo when the configured percentage permits it.

## Research and manual evidence

- FAA AIM, **§4-1-18 Terminal Radar Services for VFR Aircraft**: supports the
  information expected in a VFR radar-service request (aircraft type,
  altitude, position, route/heading) and keeps service separate from ambient
  VFR flight.
- FAA AIM, **§5-1-15 Canceling IFR Flight Plan**: pilot-initiated cancellation
  is valid in VFR conditions outside Class A; after cancellation, VFR code and
  altitude/service choices are separate. T04-75 owns the operational checks.
- FAA JO 7110.65, **§2-1-15 Radar Identification**: identification is a
  distinct controller action after contact; this scheduler must not mark a
  target identified. T04-73 owns the exact phrase and workflow.
- Existing ATC-SIM `src/pilot/checkinQueue.ts`: seeded sim-time queue and radio
  busy/idle gating are the local scheduling pattern; VFR requests remain a
  separate queue and event family.

## Documentation and non-goals

This is not a command ticket: it adds no typed/spoken grammar, no Path C
instruction, and no controller shortcut. T04-76 owns help modal,
`docs/USER.md`, setup labels, and final integrated acceptance. If a visible
request-status surface is added later, it must describe queued/transmitted
pilot events and must not imply that a clearance or radar identification exists.

Do not add ground-originated requests, controller approval/decline/terminate
behavior, radar-context formatting, SQ/IDENT/CLR grammar, IFR route/plan
construction, IFR cancellation execution, cloud speech, wall-clock timers,
unseeded randomness, or a second airspace/airport catalog.

## Handoff

Return `READY TO MERGE` only after focused queue/integration tests and the KATL
manual checklist pass. Report the exact `vfrRequests` defaults/errors, request
event payload/state names, cap-spacing evidence, and cancellation-hook contract.
Do not modify `phases/SWARM.md`, start T04-73/T04-74/T04-75, or merge downstream
work.
