# T04-102 Contact Tower/Center runtime gates and landing closure

**Phase:** 04 Procedures (communications-transfer addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-101
**Blocks:** T04-103
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Mission

Execute `CONTACT_TOWER` and `CONTACT_CENTER` through generic transfer gates.
Reuse existing IFR tower handoff and VFR visual-final/auto-land behavior. Keep
flight rules, route, plan, beacon, and track independent. Close an IFR flight
plan only after actual landing at a functioning towered destination. Do not
delete the historical plan and do not reopen a closed plan.

## Research

- FAA JO 7110.65 §2-1-15/16/17:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_1.html
  Control and communication transfer require coordination and occur before the
  aircraft enters the receiving jurisdiction; nonapproach tower coordination
  applies to surface-area operations.
- FAA JO 7110.65 §7-6-8:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_6.html
  Inform tower of VFR aircraft position, then instruct aircraft to contact tower.
  Transfer point varies and ordinarily occurs at least 5 NM from the runway.
- FAA AIM §5-1-14/15:
  https://www.faa.gov/air_traffic/publications/aim_html/chap5_section_1.html
  VFR/DVFR plans are pilot/FSS responsibility; IFR plans to functioning
  towered airports automatically close upon landing; IFR plans to airports
  without functioning towers require pilot cancellation.
- FAA JO 7110.65 §5-1-9:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_1.html
  Radar-service termination is separate from contact/tower transfer and has its
  own landing/frequency rules.

Trainer delta: `RegionalAirport.towered === true` represents a functioning
tower for this generic trainer. No live facility schedule, frequency, control
jurisdiction, radar handoff, or STARS cab is modeled.

## Scope

### Tower transfer gate

`CONTACT_TOWER` is accepted only when all applicable conditions pass:

- Aircraft is airborne and not already landed, despawned, or on a missed path.
- IFR aircraft passes existing approach/tower eligibility (`LOC` or `GS`,
  existing along-track gate, and valid landing context).
- VFR aircraft is operationally VFR, `AIRPORT_BOUND`, has a resolved eligible
  public-use/towered destination with a runway, and is in the existing terminal
  visual-final transfer window.
- Destination/runway data is generic regional catalog data; the command's
  facility-name string is not compared to a catalog facility name.
- Existing Class B guards remain authoritative. Contact tower never grants a
  Class B clearance and never changes VFR to IFR.

Rejected tower commands leave every aircraft field unchanged.

### Center transfer gate

`CONTACT_CENTER` reuses the existing generic center eligibility gate for an
outbound/departure aircraft. It preserves route, flight rules, active plan,
beacon, and track, and records generic center transfer state. It does not
auto-land, despawn, cancel IFR, or terminate radar service.

### Flight-plan completion

- Add minimal orthogonal completion metadata to the existing `FlightPlan`, such
  as `closedAtSimMs?: number`; presence means the plan completed and is terminal.
- Keep the plan record for history and session review.
- Exclude a closed plan from active operational correlation/list projections.
- Do not use existing `status: "deleted"`; deletion remains distinct and keeps
  its existing beacon-clearing semantics.
- Do not provide a reopen command. A later flight receives a new plan.
- At actual `nav.landed`, close only an active IFR plan whose resolved
  destination is a functioning towered airport.
- VFR/DVFR plans never close automatically.
- IFR plans landing at a non-towered airport remain open for explicit pilot
  cancellation.
- `CONTACT_TOWER` itself never closes a plan.

### Exact runtime errors

| Condition | Error |
| --- | --- |
| Tower command outside valid arrival/landing gate | `CONTACT TOWER: aircraft is not eligible for tower transfer` |
| Tower command with no eligible towered destination/runway | `CONTACT TOWER: no eligible towered destination` |
| Center command outside valid outbound gate | `CONTACT CENTER: aircraft is not eligible for center transfer` |
| Aircraft missing/unknown | Existing callsign association error; no partial mutation |

## Acceptance contract

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Eligible IFR arrival + `CONTACT ATLANTA TOWER` | Generic tower transfer accepted | Preserve IFR, clearance, route, beacon, and track; use existing landing behavior | Ineligible arrival returns exact tower error atomically | JO §§2-1-15, 7-6-8 |
| Eligible VFR airport-bound arrival + `CONTACT ATHENS TOWER` | Generic VFR tower transfer accepted | Preserve VFR; enter existing visual-final/auto-land path | Missing runway/destination/gate returns exact error | JO §7-6-8; T04-83 |
| VFR transit or departure + tower command | Reject | No navigation, flight-rule, route, plan, beacon, or track mutation | `CONTACT TOWER: aircraft is not eligible for tower transfer` | JO §7-6-8 |
| Eligible outbound aircraft + `CONTACT ATLANTA CENTER` | Generic center transfer accepted | Preserve route, flight rules, plan, beacon, and track | Arrival/final aircraft returns exact center error | JO §2-1-15 |
| IFR aircraft touches down at functioning towered destination | Plan closes | Set completion metadata at `nav.landed`; retain historical record; remove from active views | Contact/visual-final entry before touchdown does not close plan | AIM §5-1-15 |
| IFR aircraft touches down at non-towered destination | Aircraft lands; plan remains open | Pilot cancellation remains required | No automatic closure | AIM §5-1-15; JO §4-2-10 |
| VFR/DVFR aircraft touches down at towered destination | Aircraft lands; plan remains open | No automatic VFR plan close | Pilot/FSS cancellation remains required | AIM §5-1-14 |
| `CONTACT ... TOWER` with no frequency | Accepted/rejected solely by runtime gate | No frequency state exists | No frequency required in this slice | JO §2-1-17 trainer delta |
| `CONTACT ... TOWER` with frequency-bearing IR/text | Parse/runtime never reaches transfer | No state mutation | Rejected by T04-101 | User scope decision |
| Contact transfer while radar service active | Transfer occurs without service termination | Radar/service marker and beacon remain unchanged | Explicit radar termination remains separate | JO §5-1-9 |
| VFR tower transfer aimed through Class B without accepted clearance | Existing Class B guard controls result | VFR remains VFR; no implicit Bravo authorization | Reject/hold according to existing Class B error path | JO §7-9-2/3; existing Class B contract |

## Acceptance criteria

- [ ] Tower and center commands use generic runtime gates and existing shared
  handoff/landing helpers; no facility-specific branch is added.
- [ ] VFR tower transfer preserves VFR and cannot authorize Class B entry.
- [ ] IFR tower transfer preserves IFR until landing or separate pilot action.
- [ ] Center transfer never auto-lands or closes a plan.
- [ ] Rejected commands are atomic with exact errors and no unrelated mutation.
- [ ] `nav.landed` closes only eligible IFR plans at functioning towered
  destinations, retains historical records, removes them from active views, and
  never reopens them.
- [ ] VFR/DVFR and non-towered IFR plans do not auto-close.
- [ ] Radar service, beacon, route, and flight rules remain separate state.
- [ ] Synthetic tests cover all acceptance rows and existing T04-83/T04-20
  behavior remains green.
- [ ] `npm run ci` passes.

## Test plan

- Unit: tower/center gate matrix, exact errors, atomic rejection, closed-plan
  active-list filtering, and no-reopen behavior.
- Integration: IFR approach to towered landing; IFR approach to non-towered
  landing; VFR airport-bound auto-land; VFR transit/departure rejection;
  center transfer; Class B no-authorization guard.
- Regression: existing Shift+H tower/center handoff, T04-83 VFR auto-land,
  T04-75 IFR cancellation, radar-service termination, and plan correlation.
- Manual: synthetic session verifies transfer before landing, VFR/IFR state,
  closed plan retained but absent from active views, and no frequency/STARS
  behavior.

## Non-goals

- Individual facility identity or operating-hours validation.
- Frequency data or frequency changes.
- Pilot permission requests.
- New approach clearances, radar handoff UI, STARS features, tower cab,
  ground traffic, sequencing, separation, or phase 5.

## Handoff

Return `READY TO MERGE` only after focused runtime/integration tests, regression
tests, CI, and manual gate inspection pass. Return `BLOCKED` with exact failed
gate otherwise.
