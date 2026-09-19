# T04-75 Pilot IFR cancellation and VFR continuation

**Phase:** 04 Procedures (satellite traffic addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-74
**Blocks:** T04-76
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Model pilot-initiated cancellation of an airborne IFR flight plan outside Class B
airspace, controller acknowledgment with standard phraseology, atomic operational
reversion to VFR, and resumption of autonomous VFR navigation. Active IFR
clearance and approach guidance clear while the manual flight plan remains
compiler input and is not rewritten. Radar advisory service (flight following)
remains separate and is not automatically terminated.

## Context

T04-72 schedules pilot cancellation candidates among accepted airborne IFR
pickups from T04-74. T04-74 owns the VFR-to-IFR pickup transaction. This ticket
owns the reverse operational transition from IFR back to VFR.

In FAA air traffic procedures (FAA JO 7110.65 §4-2-10 and AIM §5-1-15), IFR
cancellation is exclusively pilot-initiated; an air traffic controller never orders
a pilot to cancel IFR. When a pilot reports canceling IFR, the controller
acknowledges with `(Call sign) IFR cancellation received`.

This is distinct from:
- `CANCEL_APPROACH` (T04-66), which cancels an instrument approach clearance but
  leaves the aircraft operating under IFR;
- `TERMINATE_RADAR_SERVICE` (T04-73), which ends radar advisory service / flight
  following without altering operational flight rules or clearance;
- `ASSIGN_SQUAWK` / `SQ VFR`, which changes transponder beacon code without
  changing flight rules.

Cancellation must also respect three-dimensional Atlanta Class B boundaries: VFR
flight inside Class B requires a Class B clearance (not supported in this
trainer). Therefore, cancellation inside Bravo or without a valid VFR continuation
path is prohibited.

## Research

- **R01:** FAA JO 7110.65, §4-2-10, Cancellation of IFR Flight Plan:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap4_section_2.html
  "Respond to a pilot's statement that the IFR flight plan is canceled by saying,
  '(Call sign) (cancellation received).' When appropriate, issue instructions for
  the continuation of flight under VFR."
- **R01:** FAA JO 7110.65, §5-1-13, Radar Service Termination:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap5_section_1.html
  "Inform aircraft when radar service is terminated: ... Radar service terminated
  [squawk VFR] ... [frequency change approved]."
  Radar service termination is an independent action; canceling IFR does not
  automatically terminate radar service or change beacon to 1200.
- **R01:** FAA JO 7110.65, §7-9-2 and §7-9-3, Class B Airspace Services / VFR
  Operations:
  https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap7_section_9.html
  VFR aircraft require explicit Class B entry clearance. IFR aircraft inside Class B
  cannot cancel IFR without Class B clearance. In this trainer, Class B VFR entry is
  not supported; cancellation is strictly prohibited inside any Class B volume.
- **R03:** FAA AIM §5-1-15, Canceling IFR Flight Plan:
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_1.html
  "An IFR flight plan may be canceled at any time the flight is operating in VFR
  conditions outside Class A airspace by the pilot stating 'CANCEL IFR' with the
  air traffic facility with which the flight is in communication."

Trainer deltas:
- Simulator operates under continuous VMC assumption.
- Controller acknowledgement uses the approved full phrase: `IFR cancellation received`.
  Existing shortcuts (`SQ`, `I`, `CLR`) remain; no new compact abbreviations are added.
- Autonomous continuation restores destination-bound navigation or zone roaming
  avoiding Atlanta Bravo; tower coordination at satellite airports is assumed.
- No Class B VFR entry clearance is supported.

## Scope

- Consume T04-72's scheduled cancellation candidates. At candidate trigger time,
  verify operational pre-conditions:
  - Aircraft is airborne and operating `IFR` (`aircraft.flightRules === "IFR"` and
    `aircraft.activeClearance` is present).
  - Aircraft is physically outside all 3D Atlanta Class B volumes (polygon, floor,
    ceiling) loaded from T04-70.
  - Aircraft is not on a captured instrument approach final or inside the surface
    Bravo ring of KATL.
  - A valid autonomous VFR continuation path exists that avoids Atlanta Class B.
  If conditions are met, pilot emits radio report: `"<callsign>, canceling IFR"`,
  and the aircraft enters `IFR_CANCELLATION_PENDING` state. If conditions fail,
  withdraw candidate with a deterministic reason.
- Add controller acknowledgment command in typed and spoken grammar:
  - Full typed form: `<callsign> IFR cancellation received`
  - Full spoken form: `<callsign>, IFR cancellation received`
  - Command IR: `{ type: "ACKNOWLEDGE_IFR_CANCELLATION" }`
  - Retain existing shortcuts; add no new compact abbreviations.
- Operational transition on acknowledgment:
  - Transition aircraft operational rules: `aircraft.flightRules = "VFR"`.
  - Clear `aircraft.activeClearance`.
  - Clear active approach guidance (`clearedApproach`, `interceptLocalizer`,
    `expectApproach`, glideslope arming), returning guidance to radar vectors /
    own navigation.
  - Clear IFR-only MSAW/Mode-C alert eligibility marker set by T04-74.
  - Resume autonomous VFR navigation: aircraft navigates toward its destination
    satellite airport or zone wandering/transit per T04-71, obeying GA performance
    profiles and avoiding Atlanta Class B. If controller had issued tactical vectors
    prior to cancellation, vectors remain until `RESUME_OWN_NAVIGATION` or VFR
    continuation waypoint intercept per T04-71 rules.
  - Service status: radar advisory service / flight following remains in its
    current state. It is NOT automatically terminated. The transponder beacon code
    is NOT automatically changed to 1200. The controller may later issue
    `radar service terminated` (`TERMINATE_RADAR_SERVICE`) or `SQ VFR` as desired.
  - Editable flight plan: `world.flightPlans` is preserved unchanged (byte/deep-equal
    before and after). No manual plan route, altitude, ACID, or beacon is modified.
- Error handling & atomic rejection:
  - Acknowledgment without a pending pilot cancellation report:
    `CANCELLATION: no pending pilot IFR cancellation`
  - Aircraft is not operational IFR:
    `CANCELLATION: aircraft is not operating IFR`
  - Aircraft is currently within Class B volume:
    `CANCELLATION: cannot cancel IFR inside Class B airspace`
  - Aircraft on ground:
    `CANCELLATION: aircraft is on ground`
  - Unsafe / blocked continuation:
    `CANCELLATION: unable to establish safe VFR continuation`
  All rejections leave aircraft kinematics, rules, clearance, plan, and service
  state completely untouched.
- Parity & multi-channel consistency:
  - Update frontend parser (`parseRadioText.ts`, `parse-command.ts`).
  - Update Command IR closed union (`src/core/command/types.ts`).
  - Update Path C schema, prompt, GBNF grammar (`speech-api/parse_grammar.gbnf`),
    validator (`speech-api/parse_engine.py`), mock pytest suite, and live eval
    corpus in the same coherent slice.
  - Deterministic pilot readback acknowledging the transition.
- Presentation & Documentation:
  - Datablocks, strips, and VFR lists immediately reflect operational VFR rules.
  - Update Help overlay (`ScopeHelpOverlay.tsx`, `src/scope/keymap.ts`).
  - Update `docs/USER.md`, `phases/04-procedures/README.md`,
    `phases/_shared/command-ir.md`, and `phases/_shared/parse-pipeline.md`.

## Out of scope

- Controller-initiated IFR cancellation (strictly prohibited by FAA rules).
- Class B VFR entry clearance or VFR Bravo routing.
- Special VFR (SVFR) or VFR-on-top.
- Automatic transponder squawk 1200 or automatic radar service termination on
  cancellation.
- Non-ambient / authored primary arrival IFR cancellations.
- Session setup UI controls (owned by T04-76).

## Implementation notes

Keep the operational transition atomic and reversible for synthetic tests:

```ts
interface AcknowledgeIfrCancellationInstruction {
  type: "ACKNOWLEDGE_IFR_CANCELLATION";
}
```

When `ACKNOWLEDGE_IFR_CANCELLATION` executes:
1. Validate `aircraft.flightRules === "IFR"` and `aircraft.cancellationPending === true`.
2. Check 3D Class B avoidance geometry: current `(x, y, alt)` must not lie inside
   any Class B shelf.
3. Remove active clearance snapshot: `delete aircraft.activeClearance`.
4. Revert operational flight rules: `aircraft.flightRules = "VFR"`.
5. Reset approach guidance states (`approachState`, `interceptLocalizer`, etc.).
6. Engage T04-71 autonomous VFR navigation continuation.
7. Clear `cancellationPending` marker.
8. Maintain `flightFollowing.active` as-is (do not change).

Exact cancellation rejection details:

| Condition | Reason/detail |
| --- | --- |
| no pending pilot cancellation | `CANCELLATION: no pending pilot IFR cancellation` |
| aircraft not operating IFR | `CANCELLATION: aircraft is not operating IFR` |
| aircraft inside Class B shelf | `CANCELLATION: cannot cancel IFR inside Class B airspace` |
| aircraft on ground | `CANCELLATION: aircraft is on ground` |
| no valid autonomous continuation | `CANCELLATION: unable to establish safe VFR continuation` |

Readback template:
`"(callsign) IFR cancellation received"` followed by pilot readback.

## Acceptance contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Candidate reaches scheduled cancellation sim time outside Bravo in VMC | Pilot transmits `canceling IFR` | Aircraft enters `cancellationPending: true`; radio log records report | Inside Bravo or without continuation -> candidate withdrawn; no call | R01 §4-2-10; R03 §5-1-15; scheduler unit |
| `DAL123 IFR cancellation received` / spoken equivalent | Controller acknowledges valid pending cancellation | Operational rules revert to VFR; active clearance and approach guidance cleared; autonomous continuation active; manual plan unchanged | No pending report -> `CANCELLATION: no pending pilot IFR cancellation`; no state change | R01 §4-2-10; typed/spoken command test |
| Cancellation acknowledged while aircraft receives flight following | IFR flight plan canceled, flight following remains active | Operational rules VFR, `flightFollowing.active === true`, squawk remains assigned discrete code | Does not auto-assign 1200 or terminate service | R01 §5-1-13; service isolation test |
| Aircraft inside Atlanta Class B attempts cancellation | Rejected by safety guard | Aircraft remains IFR, active clearance and guidance intact | `CANCELLATION: cannot cancel IFR inside Class B airspace` | R01 §7-9-2/3; 3D polygon unit test |
| Controller attempts `DAL123 IFR cancellation received` without prior pilot report | Rejected atomically | No change to rules, clearance, plan, or guidance | `CANCELLATION: no pending pilot IFR cancellation` | R01 §4-2-10; negative command test |
| `DAL123 IFR cancellation received` on aircraft already VFR | Rejected atomically | Aircraft remains VFR; no plan or guidance mutation | `CANCELLATION: aircraft is not operating IFR` | Rules guard unit test |
| Aircraft with captured localizer/approach guidance cancels IFR | Guidance disengaged cleanly; aircraft returns to autonomous VFR continuation | Approach mode cleared, descent stopped at safe VFR altitude; no glidepath tracking | Captured inside Bravo -> rejected by Bravo guard | Procedure/guidance integration test |
| Manual `FlightPlan` inspection before and after cancellation | Byte-identical / deep-equal | `world.flightPlans` untouched; plan route and altitude preserved | No silent rewriting of manual flight plan fields | Plan independence test |
| Typed, Path A/B, Path C, and PTT acknowledgment | Identical `ACKNOWLEDGE_IFR_CANCELLATION` IR emitted | Closed-union parity across browser and speech-api | Incomplete phrase, extra arguments, or missing callsign -> parse miss | Parity test suite; speech mock pytest |

## Acceptance criteria

- [ ] **AC1 — Pilot-initiated trigger:** Only an airborne, operational IFR
  aircraft outside Class B with a valid continuation path may emit an IFR
  cancellation report; candidate emits report once and sets pending state.
- [ ] **AC2 — Full command grammar:** Typed and spoken `IFR cancellation received`
  parse to `ACKNOWLEDGE_IFR_CANCELLATION` with full browser and Path C parity;
  no shorthand aliases or cloud fallbacks are added.
- [ ] **AC3 — Atomic operational transition:** Acknowledging cancellation reverts
  `aircraft.flightRules` to `VFR`, clears `activeClearance`, disengages approach
  guidance, and resumes autonomous VFR navigation without partial state mutation.
- [ ] **AC4 — Airspace protection:** Cancellation is strictly forbidden inside
  any 3D Atlanta Class B shelf; aircraft inside Bravo reject cancellation and
  remain IFR.
- [ ] **AC5 — Service separation:** Radar advisory service / flight following is
  unaffected by IFR cancellation; beacon code remains unchanged; radar service
  termination remains a separate explicit controller action.
- [ ] **AC6 — Plan independence:** The manual `FlightPlan` in `world.flightPlans`
  is byte/deep-equal before and after cancellation; no plan fields are modified.
- [ ] **AC7 — Negative matrix:** Attempts to cancel without pilot report, on
  ground, while already VFR, or inside Class B reject with exact documented errors.
- [ ] **AC8 — Documentation & tests:** Help overlay, `docs/USER.md`, shared
  command contracts, synthetic integration tests, `npm run ci`, and speech mock
  pytest pass.

## Test plan

- **Unit:** cancellation candidate pre-conditions (3D Bravo test, operational
  rules test), command parser (typed, spoken, Path C GBNF), exact error messages,
  atomic rollback on failure.
- **Integration:** airborne VFR → pickup (T04-74) → candidate schedule (T04-72) →
  pilot report → `IFR cancellation received` → verify operational VFR, cleared
  approach guidance, active autonomous navigation, intact flight plan, and
  continued flight following.
- **Negative:** cancel while inside Bravo shelf, cancel without pilot call,
  cancel when already VFR, malformed command grammar.
- **Parser parity:** typed and Path C eval corpus agreement for
  `ACKNOWLEDGE_IFR_CANCELLATION`.
- **Manual:** Run KATL session outside Bravo; observe pilot cancellation call,
  issue `DAL123 IFR cancellation received`, verify datablock updates to VFR,
  flight following persists, aircraft avoids Bravo, and manual plan is unmodified.
  Cite R01 §4-2-10 and AIM §5-1-15.

## Suggested files

- `src/core/aircraft.ts`
- `src/core/world.ts`
- `src/core/flightPlan.ts`
- `src/core/command/types.ts`
- `src/pilot/validate.ts`
- `src/pilot/applyIntent.ts`
- `src/pilot/handleRadioText.ts`
- `src/pilot/readback.ts`
- `src/parse/parse-command.ts`
- `src/parse/parseRadioText.ts`
- `src/parse/spoken/grammar.ts`
- `src/parse/path-c.ts`
- `speech-api/parse_engine.py`
- `speech-api/parse_grammar.gbnf`
- `src/scope/datablock.ts`
- `src/scope/systemLists.ts`
- `src/ui/overlays/ScopeHelpOverlay.tsx`
- `src/scope/keymap.ts`
- `phases/_shared/command-ir.md`
- `phases/_shared/parse-pipeline.md`
- `phases/04-procedures/README.md`
- `docs/USER.md`
