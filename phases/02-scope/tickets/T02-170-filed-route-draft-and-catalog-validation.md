# T02-170 Filed-route draft and catalog validation

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-169  
**Blocks:** T02-171  
**Merge target:** `feature/nas-flightplan-modal`  
**Launch:** Implement this ticket only.

## Mission

Add an atomic local flight-plan draft service. A submitted filed route is parsed
and resolved against the loaded scenario catalog, then the complete plan is
created or amended in one transaction. The route is filed metadata only; it
never becomes aircraft guidance.

## Research

- FAA JO 7110.65 §2-3-4, terminal strip fields 5, 7–9: assigned beacon,
  requested altitude, airport/route/remarks, and control data are distinct
  operational data. <https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_3.html#para-2-3-4>
- Supplied `full_manual.pdf`, §5.5.5 pp. 5-105–5-110 and §5.6.17 pp.
  5-167–5-173: full plan data and plan modification field constraints.
- `src/core/flightPlan.ts`: authoritative local plan fields and existing
  one-field mutation guardrails.

**Trainer delta:** the browser modal and its compact filed-route grammar are
ATC-SIM UI, not a claim of NAS/STARS flight-data entry compatibility.

## Contract

Introduce a generic, persisted `filedRoute` representation alongside the
existing display `route` text. It resolves only against the supplied loaded
catalog; it must not use an ICAO/facility switch.

Canonical route grammar, whitespace-insensitive and case-insensitive:

```text
SID:<procedureId>[/<transitionId>]
STAR:<procedureId>[/<transitionId>]
DCT <fixId-or-navaidId>
```

Route entries are left-to-right. `DCT` consumes exactly the following catalog
fix or navaid. SID/STAR are explicitly prefixed, so a same-name fix and
procedure can never be guessed. Bare procedure, bare transition, airway,
lat/lon, hold, ARINC leg, `DCT` without a target, and a target before `DCT`
are rejected. Empty route is valid (no filed route).

The transaction accepts all modal-supported `FlightPlan` fields, validates the
complete candidate before mutation, and preserves status and association on an
amendment. It must not update `Aircraft`, `Intent`, FMS/lateral route,
kinematics, reported beacon, Command IR, session events, or readback.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| New `AAL123`, `SID:SID1/N DCT FIXA` | Parsed/resolved draft creates pending plan | Persist normalized text + ids | — | JO §2-3-4; manual §5.5.5 |
| Existing `AAL123`, valid full draft | Replaces editable fields atomically | Keeps plan id/status/association | — | manual §5.6.17 |
| `SID:SID1/NOPE` | No save | Existing plan byte-for-byte unchanged | `UNKNOWN_TRANSITION` | catalog fixture |
| `DCT` / `J60` / `SID1` | No save | None | `INCOMPLETE_ROUTE`, `UNSUPPORTED_ROUTE_TOKEN`, `AMBIGUOUS_ROUTE_TOKEN` | trainer grammar |
| Duplicate ACID/beacon or invalid active-only field | No save | None | existing stable plan error | manual field constraints |

## Scope

- Add exported DOM-free filed-route parse/resolve types and functions near the
  flight-plan domain or scenario procedure helpers; use `FacilityCatalog` ids,
  not KDEM/KATL literals.
- Add an exported all-fields `saveFlightPlanDraft`-style transaction that
  returns field/error code information and only commits after every scalar,
  route, duplicate, status, and capacity rule passes.
- Normalize display route from resolved segments. Preserve current `route`
  projection for strips; do not make renderers interpret a route.
- Cover catalog lookup for fixes, VORs, NDBs, SID and STAR transitions,
  including synthetic same-name ambiguity.

## Acceptance criteria

- [ ] A synthetic catalog resolves SID, STAR, transition, fix, and navaid ids
  without a facility branch.
- [ ] Valid route and all supported scalar fields save as one plan draft.
- [ ] Invalid route/scalar/duplicate causes no partial plan mutation.
- [ ] Existing association, aircraft surveillance fields, intent, position,
  and active lateral/vertical modes stay unchanged after every successful save.
- [ ] No pilot, parse-radio, speech, or scope render import is introduced.

## Tests

- `src/core/test/flightPlan.test.ts`: table-driven route grammar and atomic
  create/amend cases; synthetic catalog only.
- Procedure helper tests: unknown/ambiguous ids, wrong procedure kind,
  transition absence, DCT ordering, no-route case.
- Regression: capture plan and aircraft snapshots before failed and successful
  draft saves; assert only permitted plan fields differ.
- Run focused tests and `npm run ci`.

## Non-goals

- Modal/UI, `*FP`, radio, Command IR, pilot readback, squawk assignment,
  clearance limits, route activation, direct/resume-own-navigation,
  descend-via execution, airways, CIFP expansion, networking, or facility
  branches.

## Handoff

Worker reports changed paths, commits, focused tests, `npm run ci`, manual
source result, and exactly `READY TO MERGE` or `BLOCKED`.
