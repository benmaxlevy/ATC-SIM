# T02-189 IFR clearance route-chain contract and execution

**Phase:** 02 Scope  
**Priority:** P0  
**Size:** L  
**Depends on:** T02-180, T02-181, T02-182, T02-184  
**Blocks:** T02-190, T02-191, T02-192  
**Merge target:** `feature/clearances`  
**Launch:** Implement this ticket only; stop at configured boundary.

## Mission

Replace fixed IFR-clearance access variants with one catalog-grounded ordered
route-chain contract. Preserve the aircraft-owned clearance snapshot and the
existing route compiler. The route chain is not a flight-plan edit.

## Contract

Canonical IFR clearance access is:

```ts
type ClearanceRouteSegment =
  | { type: "DIRECT"; fixId: string }
  | { type: "PROCEDURE"; procedureId: string; transitionId?: string };

type IfrClearanceAccess =
  | { type: "AS_FILED" }
  | { type: "RADAR_VECTORS" }
  | { type: "EXPLICIT_ROUTE"; segments: ClearanceRouteSegment[] };
```

`EXPLICIT_ROUTE` with zero segments means direct to the clearance limit. The
canonical output no longer uses `FIX_THEN_DIRECT` or `SID`; existing accepted
forms normalize to this shape at the parser boundary. Tactical
`CLEARED/PROCEED DIRECT <fix>` remains a separate lateral command.

The application serializes the ordered segments plus `limitId` through the
existing catalog route compiler, then stores the compiled result in the
aircraft-owned active-clearance snapshot. It never writes the editable flight
plan route or metadata.

`CVIA` remains valid only when the resolved explicit route contains a SID.
Procedure kind comes from catalog resolution; a STAR or generic procedure
segment must not acquire SID climb-via semantics.

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| `CLR TO KATL VIA DIRECT` | `EXPLICIT_ROUTE` with `segments: []` | Active route flies direct to KATL; plan unchanged | Missing limit or `VIA` body -> `PARSE_MISS`/`UNABLE_CLEARANCE` | FAA JO 7110.65 §§4-2-1, 4-2-5 |
| `CLR TO KATL VIA SWEPT HOUND` | Ordered `DIRECT SWEPT`, `DIRECT HOUND` | One compiled active snapshot; FMS follows both legs | Unknown route token -> `UNABLE_ROUTE`; no mutation | FAA JO 7110.65 §§4-4-1, 4-4-2 |
| `CLR TO KATL VIA DIRECT SWEPT DIRECT HOUND DIRECT` | Same two direct segments; final `DIRECT` targets limit | Explicit markers do not create phantom segments | Repeated marker without target -> `PARSE_MISS` | FAA JO 7110.65 §§4-2-5, 4-4-1 |
| `CLR TO KATL VIA SID1 NORTH HOUND` | Procedure plus transition, then direct HOUND | SID semantics preserved; plan unchanged | Ambiguous procedure/transition -> `UNABLE_ROUTE` | FAA JO 7110.65 §§4-2-1, 4-4-2 |
| Later plan edit after issued chain | Existing active snapshot remains unchanged | Only later clearance replaces snapshot | No watcher or implicit re-clearance | Supplied STARS manual §§5.5.5 p. 5-95, 5.6.17 p. 5-167 |
| Invalid segment with existing active clearance | Reject new clearance | Previous active clearance and plan remain unchanged | Exact code `UNABLE_ROUTE`, message begins `unable route:` | FAA JO 7110.65 §4-2-5 |

## Scope

- Update the frontend Command IR and core clearance route serialization.
- Replace fixed access branches with the generic segment list.
- Reuse `resolveFiledRoute()` and existing FMS flattening/cursor behavior.
- Preserve `AS_FILED`, `RADAR_VECTORS`, optional field order, atomicity,
  clearance replacement, and flight-plan immutability.
- Preserve existing procedure/catalog ambiguity precedence.
- Update core/pilot readback data plumbing as needed for the new shape.
- Update shared `phases/_shared/command-ir.md` with the canonical contract.

## Acceptance criteria

- [ ] Every explicit route is represented by one ordered `segments[]` list.
- [ ] There is no semantic maximum of one intermediate fix or one procedure.
- [ ] Direct and procedure segments compile through the existing generic route
  compiler in input order.
- [ ] Empty explicit route executes direct to the clearance limit.
- [ ] Active-clearance snapshot remains independent from later plan edits.
- [ ] Invalid, unknown, ambiguous, or airport-as-route segments reject
  atomically with `UNABLE_ROUTE` and no state replacement.
- [ ] `CVIA` rejects without a resolved SID and remains valid for a SID chain.
- [ ] Tactical direct remains separate and unchanged.

## Test plan

- Synthetic route-contract tests with zero, one, three, and many segments.
- Mixed direct/procedure/procedure-transition route tests.
- SID/STAR/CVIA semantic tests.
- Atomic rejection with and without an existing active clearance.
- Plan mutation/snapshot stability regression tests.
- Existing direct, SID, STAR, vectors, as-filed, and optional-field suites.
- `npm run ci`.

## Manual review

- Review route ordering and direct-to-limit behavior against FAA JO 7110.65
  §§4-2-1, 4-2-5, 4-4-1, and 4-4-2.
- Review active-clearance versus editable-flight-plan behavior against the
  supplied STARS manual at §§5.5.5 p. 5-95 and 5.6.17 p. 5-167.
- Mark the independent active-snapshot rule as ATC-SIM trainer behavior, not
  FAA phraseology.

## Non-goals

No airway expansion, route amendments with `REST OF ROUTE UNCHANGED`, holds,
EFC, VFR pickup/airfile, cloud inference, broad ASR repair, airport search,
new tactical commands, or facility-specific branches.

## Handoff

Worker returns exactly `READY TO MERGE` or `BLOCKED`, including changed paths,
focused tests, `npm run ci`, and manual/FAA review notes. No merge or push by
worker.
