# T04-43 STAR descend-via transition amend

**Phase:** 04 Procedures (twenty-second swarm addendum)
**Priority:** P0
**Size:** M
**Depends on:** T04-04, T04-15
**Blocks:** T04-44
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

A controller can amend an active STAR descend-via clearance with a named
enroute or runway-tagged STAR transition. The aircraft joins only where the
selected transition shares a catalog fix with its current remaining route;
existing `VIA DEM1` behavior remains unchanged when no transition is named.

## Context

T04-15 already arms `VIA_STAR` for catalog-backed arrivals, and T04-04
establishes descend-via vertical constraints. The missing operation is a
controller-selected transition, including a runway transition when an active
runway makes one applicable. This is a catalog operation, not an airport
operation: KDEM `DEM1` is the authored default, not a runtime branch.

The shared Command IR contract must remain synchronized with TypeScript.
Adding `transitionId` to an instruction requires the same change to
`phases/_shared/command-ir.md`.

## Research

- **R01 — JO 7110.65**, https://www.faa.gov/air_traffic/publications/atpubs/atc_html/;
  Search: `FAA JO 7110.65 descend via STAR transition`. Use for Descend Via,
  arrival clearance amendments, and controller/pilot readback.
- **R03 — AIM**, https://www.faa.gov/air_traffic/publications/atpubs/aim_html/;
  Search: `FAA AIM descend via STAR clearance`. Use for pilot-heard
  procedure-name and transition phraseology.

**Official terms:** Descend Via, STAR, transition, runway transition,
enroute transition, common fix, readback.

**Trainer delta:** This simulator resolves transitions from its loaded JSON
catalog and rejects impossible joins deterministically. It is not NAS
adaptation or certified clearance guidance.

## Scope

- Add optional `transitionId?: string` to `DESCEND_VIA` and `JOIN_PROCEDURE`
  in `src/core/command/types.ts`.
- Patch `phases/_shared/command-ir.md` in the same change with both fields,
  typed parser rows, spoken parser examples, and validation notes.
- Extend typed parsing:
  - `VIA DEM1` → `{ type: "DESCEND_VIA", procedureId: "DEM1" }`.
  - `VIA DEM1 WN` → the same instruction with `transitionId: "WN"`.
  - `JOIN DEM1 WN` → `JOIN_PROCEDURE` with `transitionId: "WN"`.
- Extend spoken parsing:
  - “descend via DEMO ONE, north transition” and
    “descend via DEMO ONE, runway niner transition” resolve to the same
    normalized transition id supplied by the catalog/parser vocabulary.
  - Preserve existing “descend via demo one” output.
- Update `src/core/fms/procedureJoin.ts` and `joinNamedProcedure` to:
  - search `catalog.stars` by `procedureId`;
  - resolve `transitionId` by catalog id;
  - consider `runwayId` and `runways` on `StarTransition` when selecting a
    runway-tagged transition;
  - find a shared fix between the selected transition and the aircraft's
    current remaining STAR route;
  - rebuild only the remaining route from the current fix or next matching
    common fix.
- Update `src/pilot/applyIntent.ts`, `validate.ts`, and `readback.ts`:
  - validate before mutating intent;
  - retain the current descend-via mode while applying a valid amendment;
  - produce deterministic readback containing procedure and transition;
  - preserve heading/vector cancellation of lateral procedure and VIA modes.
- Define and document rejection codes:
  - unknown STAR → existing `UNKNOWN_PROCEDURE`;
  - unknown transition → `UNKNOWN_TRANSITION` (add this code if no existing
    named code fits);
  - known transition with no reachable common fix → explicit join rejection
    (use the repository's existing unable/not-on-course code if present).
- Add synthetic STAR fixtures with two enroute transitions and one
  runway-tagged transition. Include a case where the aircraft is already past
  the branch and must be rejected.

## Out of scope

- SID transition amendments; T04-44 owns them.
- Rebuilding T04-04 vertical math or T04-15 STAR check-in.
- RF, hold, heading-only leg support, or flattening unsupported CIFP legs.
- New FMS path types, airport-id conditionals, runway selection UI, or
  active-runway inference outside fields already present in scenario state.
- Video maps, radar sites, or display changes.

## Implementation notes

Keep route selection generic over `catalog.stars`; never test for `KDEM`,
`KATL`, `DEM1`, or a fixture transition in live code. A transition amendment
must be atomic: resolve and prove a common fix before changing lateral,
vertical, or active procedure state.

“No transition” is semantically important. `VIA DEM1` keeps the current join
path and must not guess a transition. A runway-tagged transition is eligible
only when its catalog runway metadata matches the active runway. If several
catalog rows remain eligible, reject ambiguity rather than silently choosing.

Use catalog identifiers for IR normalization. Spoken aliases may map to those
identifiers through the existing procedure-name data. Heading, turn, and
vector instructions still cancel VIA as required by phase 4 law.

## Acceptance criteria

- [ ] **AC1 — IR contract:** TypeScript and `phases/_shared/command-ir.md`
  both define optional `transitionId` for `DESCEND_VIA` and
  `JOIN_PROCEDURE`.
- [ ] **AC2 — Existing syntax:** `VIA DEM1` produces the existing
  transition-less instruction and does not select a transition.
- [ ] **AC3 — Typed amendment:** `VIA DEM1 WN` and `JOIN DEM1 WN` parse,
  validate, and read back with transition `WN`.
- [ ] **AC4 — Spoken amendment:** spoken “descend via DEMO ONE, [transition]”
  normalizes to the same IR and readback as its typed equivalent.
- [ ] **AC5 — Common-fix join:** Given a synthetic STAR with distinct
  transitions sharing `MERGE`, a valid amendment rebuilds the remaining route
  at `MERGE` and retains descend-via constraints.
- [ ] **AC6 — Runway transition:** A matching active runway permits a
  runway-tagged transition; a nonmatching runway does not.
- [ ] **AC7 — Safe rejection:** Unknown STAR, unknown transition, ambiguous
  transition, and past-branch/no-common-fix inputs reject with no intent
  mutation.
- [ ] **AC8 — Vector law:** `FLY_HEADING` / `TURN_DEGREES` still cancel
  procedure lateral guidance and VIA vertical mode.
- [ ] **AC9 — Research:** User-facing strings use Descend Via, STAR,
  transition, and readback terminology. Code comment cites R01/R03 and states
  catalog-backed trainer delta.
- [ ] **AC10 — Automated tests:** DOM-free parser, join, validation, apply,
  rejection, and readback tests pass.

## Test plan

- **Unit:** Synthetic STAR transition lookup, common-fix route rebuild,
  runway metadata matching, parser normalization, error codes, readback.
- **Integration:** Pilot applies transition amendment before and after branch
  point; verify accepted path and unchanged intent on rejection.
- **Manual:** Issue `VIA DEM1`, then named transition amendment; verify
  route changes only at a shared fix. Issue heading and verify VIA cancels.

## Suggested files

- `src/core/command/types.ts`
- `phases/_shared/command-ir.md`
- `src/core/fms/procedureJoin.ts`
- `src/core/fms/procedureJoin.test.ts`
- `src/parse/`
- `src/pilot/applyIntent.ts`
- `src/pilot/applyIntent.test.ts`
- `src/pilot/validate.ts`
- `src/pilot/validate.test.ts`
- `src/pilot/readback.ts`
