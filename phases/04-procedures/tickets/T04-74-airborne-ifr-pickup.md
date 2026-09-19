# T04-74 Airborne VFR-to-IFR pickup

**Phase:** 04 Procedures (satellite traffic addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-70, T04-73
**Blocks:** T04-75
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

An airborne ambient VFR aircraft with an open IFR-pickup request can receive a
valid existing-shape IFR clearance to any generated, public-use, towered
controlled airport in the loaded region. The pickup is an atomic transition to
operational IFR: route/clearance execution, destination resolution, and scope
projections update, while the manually maintained flight plan remains compiler
input and is not rewritten.

## Context

`src/core/ifrClearance.ts` currently rejects VFR pickup explicitly. Its existing
contract is valuable: route compilation and optional-field validation happen
before an aircraft transaction, and issuing a clearance never projects fields
back into the editable plan. This ticket removes only the deferred VFR block and
adds a guarded airborne-request transaction. It must not weaken ordinary IFR
clearance validation.

The generated airport/airspace catalog from T04-70 is the source of truth. Do
not hand-author PDK, FTY, RYY, KATL, or any other destination list, approach,
runway, fix, or airspace boundary that the importer can supply. A second
generated facility with the same schema must work without an ICAO branch.

## Research

- **R01:** FAA JO 7110.65, §4-2-1, Clearance Items:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap4_section_2.html
  Clearance order is aircraft identification, limit, route/vectors, altitude,
  then frequency/beacon information.
- **R01:** FAA JO 7110.65, §4-2-8, IFR-VFR and VFR-IFR Flights:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap4_section_2.html
  A VFR/IFR flight receives its IFR clearance approaching the proposed IFR
  portion; changing VFR to IFR requires an appropriate beacon code for Mode C.
- **R03:** FAA AIM §5-2-6, abbreviated IFR departure / airborne request:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_2.html
  Example wording is “VFR estimating ... request IFR to ...”; the generated
  trainer request is structured data with equivalent fields.
- **R01/R03:** MSAW/Mode C eligibility analog used by the simulator:
  https://www.faa.gov/air_traffic/publications/aim_html/chap4_section_1.html
  New ambient VFR traffic does not opt into MSAW merely by receiving flight
  following; an accepted IFR pickup restores the existing Mode-C/IFR alert
  eligibility marker.

Trainer delta: no FSS, clearance-delivery position, live coordination, or
certified terrain/separation claim. “Towered controlled airport” means the
imported airport metadata marks the airport public-use and controlled/towered in
the supported Class B/C/D destination set; an airport name alone is never enough.

## Scope

- Consume T04-73's generic `IFR_PICKUP` request record and require:
  `airborne === true`, open request, radar identification, VMC/Bravo eligibility
  as supplied by the scenario, and a generated public-use controlled destination.
  Ground aircraft and a VFR aircraft with no open pickup request reject.
- Extend airport/catalog loading and parser context to all imported eligible
  airports. Preserve the separate clearance-limit namespace: an airport is a
  valid IFR limit and endpoint, never a tactical `DIRECT`/`CROSS` fix unless the
  source catalog independently lists it as one.
- Retain the existing compact form and add no aliases:

  `CLR TO <AIRPORT> VIA RADAR VECTORS [ALT <hundreds>] [CVIA] [FREQ <value>] [SQ <octal>]`

  `CVIA` remains invalid with radar vectors (`INVALID_CLIMB_VIA`). Full spoken
  form is `cleared to <airport> via radar vectors`, followed in the same existing
  optional-field order by `maintain <altitude>`, `climb via`, `frequency
  <frequency>`, and `squawk <four octal digits>`. Existing `AS FILED` and
  catalog-grounded explicit route forms remain valid only when a plan/route
  supplies the required compiler input. New ambient requests use radar vectors
  or an explicit route to the requested generated airport.
- Enforce requested-destination matching in v1: the clearance limit must equal
  the open request's generated destination. A mismatch rejects without changing
  the request or aircraft.
- Compile all route and optional fields before mutation. For a VFR aircraft with
  no manual plan, use an in-memory operational compiler input/route snapshot
  that ends at the generated airport endpoint; do not manufacture a filed plan
  or mutate `FlightPlan` fields. If an associated VFR plan exists, it remains
  unchanged even when used as route input. The active-clearance snapshot is the
  execution source.
- On success set operational aircraft rules to `IFR`, clear the radio-only VFR
  marker, attach the active route/clearance, apply assigned altitude/beacon and
  radar-vector pending state through existing helpers, mark pickup request
  `APPROVED`/completed, and set the existing MSAW/Mode-C eligibility marker.
  Do not change plan ACID, flight type/rules, assigned beacon, route text,
  `filedRoute`, `routeRecord`, or manually edited altitude. Do not alter radar
  ownership, CA/ATPA eligibility, or physical position.
- Flight following service remains a separate service state. A VFR request that
  was receiving local flight following transitions to operational IFR service;
  the controller may terminate radar service later. The pickup itself neither
  terminates service nor assigns VFR squawk.
- Extend effective flight-rules projections so datablocks, strips, and VFR/TAB
  lists prefer operational aircraft rules while an active pickup is IFR, without
  rewriting the manual plan. CA/ATPA remain track-based. MSAW uses the narrow
  eligibility marker; do not add a general VFR-vs-IFR separation algorithm.
- Extend typed/spoken browser parsing, Path C schema/prompt/GBNF/validator,
  mock/eval corpus, readback, Help, `docs/USER.md`, and phase/shared command
  contracts as one coherent change. Existing `CLR` compact and spoken IFR
  clearance forms must remain parity-compatible.

## Out of scope

- Ground VFR/IFR requests, VFR-on-top, SVFR, departure release/void, FSS, or
  clearance delivery.
- Any airport/approach/airspace data that T04-70 can import; no facility-specific
  code or handwritten satellite list.
- New approach/FMS behavior, radar separation, weather generation, or automatic
  `SQ VFR`.
- IFR cancellation (T04-75), request scheduling (T04-72), or final scenario
  acceptance/UI controls (T04-76).

## Implementation notes

Keep operational and editable-plan state explicit. The minimum observable
contract is:

```ts
// Existing Aircraft field becomes the operational display/execution value.
aircraft.flightRules: "VFR" | "IFR";
// Existing plan.flightType / plan.flightRules are filed/editable input only.
aircraft.activeClearance?: ActiveIfrClearance;
```

The implementation may add a named `operationalRules` wrapper, but scope and
pilot consumers must resolve one source consistently. A prior VFR `FlightPlan`
must not make a later eligible pickup fail solely because its filed
`flightType`/`flightRules` is VFR. Conversely, an already operational IFR
aircraft or a second active clearance must reject as a duplicate, not silently
replace route state.

Use generated airport metadata (`publicUse`, supported control/tower class,
ARP/endpoint, aliases, runway/procedure references) from T04-70. Eligibility is
`publicUse === true` and a supported controlled/towered class at or above Class
D; missing/unknown metadata rejects. The implementation must report which
source field was missing, not guess from airport size or an authored fallback.

Exact pickup reject details:

| Condition | Reason/detail |
| --- | --- |
| no open `IFR_PICKUP` request | `CLEARANCE: no pending IFR pickup request` |
| aircraft not airborne | `CLEARANCE: airborne IFR pickup required` |
| no radar identification | `CLEARANCE: radar identification required` |
| destination not in generated eligible registry | `UNABLE_ROUTE: destination airport is not an eligible controlled airport` |
| clearance limit differs from request | `CLEARANCE: clearance limit does not match requested destination` |
| operational rules already IFR / active clearance | `CLEARANCE: aircraft is already operating IFR` |
| route/optional field invalid | existing exact `UNABLE_ROUTE`, `INVALID_ALTITUDE`, `INVALID_FREQUENCY`, `INVALID_SQUAWK`, or `INVALID_CLIMB_VIA` messages |

All failures leave request, plan, active clearance, rules, route, beacon,
service, MSAW marker, ownership, and kinematics unchanged.

## Acceptance contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Generated airborne VFR call: `VFR ... request IFR to PDK` | `IFR_PICKUP` request is queued with destination PDK | Structured details only; request cap charged by T04-72 | Ground request is not created by this ticket | R01 §4-2-8; generated catalog inspection |
| `DAL123 SQ 4521`, `DAL123 I`, then `DAL123 radar contact 5 miles from DEM VOR` | Request becomes identified and ready for clearance | Squawk/IDENT existing effects; position suffix informational | Unknown fix, no request, or no IDENT attempt -> exact reject; no mutation | R01 §5-1-8/§5-3 |
| `DAL123 CLR TO KATL VIA RADAR VECTORS ALT 50 FREQ 119.5 SQ 4521` | Accepted airborne pickup when KATL is imported eligible destination | Active route/clearance snapshot, IFR operational rules, assigned altitude/beacon, MSAW eligibility; plan unchanged | Missing request/ident/airborne or duplicate IFR rejects atomically | R01 §4-2-1/§4-2-8; typed integration |
| Spoken `Delta one two three, cleared to Atlanta International Airport via radar vectors, maintain five thousand, frequency one one niner point five, squawk four five two one` | Same canonical `IFR_CLEARANCE` and runtime result as typed form | `parseStage`/source differ only | Unlisted/ambiguous airport or unsupported optional order -> `PARSE_MISS`/`BAD_CLEARANCE`; no mutation | R01 §4-2-1; Path A/B/C + speech mock |
| Clearance to imported PDK/FTY/RYY-style controlled airport | Destination resolves through generated registry and route endpoint | No new authored destination data; approach/catalog refs remain data-driven | Private/uncontrolled/Class-E-only/non-public or missing endpoint -> exact `UNABLE_ROUTE` | T04-70 generated source report; scenario acceptance |
| Existing VFR manual plan with route/fields | Pickup may use it as compiler input | Active route snapshot is aircraft-owned; `FlightPlan` deep-equal before/after | No silent plan rules/route/beacon/altitude rewrite | Plan-independence integration |
| `CVIA` with `VIA RADAR VECTORS` or `AS FILED` without a route | Rejected before transaction | No state changes | Existing `INVALID_CLIMB_VIA` / `UNABLE_ROUTE` exact messages | Existing IFR-clearance tests |
| No request, ground aircraft, requested KATL but clearance PDK, or already IFR | Rejected | Rules, request, active clearance, plan, beacon, MSAW, service unchanged | Exact details above; no partial mutation | Negative matrix |
| Ambient VFR pickup after flight-following approval | Accepted if all gates pass | Service mode changes to operational IFR; no automatic VFR squawk; termination remains separate | `SQ VFR` is only explicit controller instruction | R01 §4-2-8; manual readback |
| Typed, Path A/B, Path C, and PTT clearance | Same instruction array/runtime | Browser/Python closed-union parity | Extra fields, invented destination, or unsupported route evidence -> schema/parse miss | `npm run ci`; speech mock/eval |

## Acceptance criteria

- [ ] **AC1 — Airborne request gate:** Only an airborne, radar-identified,
  open `IFR_PICKUP` request may enter the pickup transaction; ground/no-request/
  duplicate cases reject atomically.
- [ ] **AC2 — Generated destinations:** Airport resolution is exclusively
  importer/catalog-driven and accepts every eligible public-use controlled
  airport in the loaded region without ICAO branches; unsupported metadata and
  route endpoints reject.
- [ ] **AC3 — Existing clearance grammar:** Compact `CLR` and full spoken
  clearance retain exact route/optional-field order, existing aliases, and
  `IFR_CLEARANCE` semantics; no new abbreviation or route fallback is added.
- [ ] **AC4 — Atomic operational transition:** Success sets operational IFR,
  active clearance/route, assigned fields, request completion, and MSAW
  eligibility; failure mutates nothing.
- [ ] **AC5 — Plan independence:** The editable/manual plan is byte/deep-equal
  across pickup; a VFR plan does not block a valid later pickup; no plan beacon or
  route is silently rewritten.
- [ ] **AC6 — Consumer consistency:** Datablocks/strips/lists show operational
  IFR while active; CA/ATPA preserve existing track behavior; MSAW uses only the
  narrow eligibility marker.
- [ ] **AC7 — Parser parity:** Frontend and speech-api instruction type set,
  prompt, GBNF, semantic validator, mock tests, live eval corpus, and Path C
  evidence guard agree for all accepted/rejected forms.
- [ ] **AC8 — Help/docs/tests:** Help, `docs/USER.md`, README/shared contracts,
  focused synthetic integration tests, `npm run ci`, and speech mock pytest pass.

## Test plan

- **Unit:** airport eligibility/alias grounding, airborne/request/rules gates,
  route compiler input, effective rules, exact errors, and atomic rollback.
- **Integration:** generated KATL-region airport registry → VFR request →
  SQ/IDENT/contact → `CLR TO ... VIA RADAR VECTORS` → active route and
  destination endpoint; repeat after a prior cancellation fixture.
- **Parser:** typed/full spoken/Path C parity; positive, incomplete, malformed,
  duplicate/capacity, ambiguous airport, modifier-conflict (`CVIA`), ordering,
  and unsupported-destination fixtures.
- **Manual:** KATL session: select generated satellite destination, work one
  pickup, observe IFR operational marker/route, unchanged manual plan, no VFR
  squawk side effect, and MSAW eligibility; record R01 §4-2-1/§4-2-8 and
  R03 §5-2-6.

## Suggested files

- `src/core/ifrClearance.ts`
- `src/core/aircraft.ts`
- `src/core/world.ts`
- `src/core/flightPlan.ts`
- `src/core/alerts/msaw.ts`
- `src/pilot/validate.ts`
- `src/pilot/applyIntent.ts`
- `src/pilot/handleRadioText.ts`
- `src/pilot/readback.ts`
- `src/parse/parse-command.ts`
- `src/parse/spoken/catalog-ground.ts`
- `src/parse/spoken/grammar.ts`
- `src/parse/path-c.ts`
- `speech-api/parse_engine.py`
- `speech-api/parse_grammar.gbnf`
- `src/scope/datablock.ts`
- `src/scope/systemLists.ts`
- `src/ui/overlays/ScopeHelpOverlay.tsx`
- `phases/_shared/command-ir.md`
- `phases/_shared/parse-pipeline.md`
- `phases/04-procedures/README.md`
- `docs/USER.md`

