# T04-04 Descend/climb via and crossing alts

**Phase:** 04 Procedures
**Priority:** P0
**Size:** M
**Depends on:** T04-03
**Blocks:** T04-12
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Aircraft on DEMO ONE honor **at-or-above** crossing constraints. A descend-via clearance (and an optional CROSS instruction) changes vertical intent. Climb-via is the same vertical engine with the opposite inequality, even if KDEM only ships an arrival.

## Context

STAR JSON from T04-01 already stores `AT_OR_ABOVE` on legs. T04-03 sequences those legs laterally. Without this ticket the arrival dives to the assigned altitude and busts ALPHA.

Command IR (`phases/_shared/command-ir.md`) is frozen for *names* of existing instructions. Phase 4 **may add** types. This ticket **does** extend the IR.

**Same-PR contract:** when you add `DESCEND_VIA`, `CLIMB_VIA`, and/or `CROSS` to the TypeScript `Instruction` union, you **must patch `phases/_shared/command-ir.md` in the same PR**. Do not leave the shared contract stale. Do not rename `ALTITUDE`, `DIRECT`, or any phase 0–3 type.

## Scope

- New IR variants (all three recommended):

```ts
| { type: "DESCEND_VIA"; procedureId: string }
| { type: "CLIMB_VIA"; procedureId: string }
| {
    type: "CROSS";
    fixId: string;
    altitudeFt: number;
    restriction: "AT" | "AT_OR_ABOVE" | "AT_OR_BELOW";
  }
```

- Parser: `VIA DEM1` → `DESCEND_VIA` (arrivals). `X ALPHA 40` → `CROSS` AT 4000 ft (hundreds, same as `C30`). `X ALPHA 40A` / `X ALPHA 40B` → AOA / AOB. Optional `CVIA` for climb-via if you want symmetry; otherwise `CLIMB_VIA` is only produced by spawn/tests.
- Pilot: unknown procedure/fix → reject. Apply `vertical = VIA_STAR` or attach a single CROSS constraint. Readbacks per phase README.
- Vertical FMS: while on STAR legs with VIA armed, *do not descend below* the next unpassed `AT_OR_ABOVE`. `AT` = capture that altitude by the fix (may start down early). `AT_OR_BELOW` = must be at or below by the fix (KDEM STAR does not need this except CROSS tests).
- Assigned `ALTITUDE` still sets `assignedAltitudeFt`. VIA uses `min`/`max` with constraints: the aircraft should descend toward the lower of (assigned, what the STAR allows *now*). If the controller has not assigned below the constraint, still descend to meet AOA (typical descend-via). Document: **VIA means constraints are the clearance; assigned altitude is a floor/ceiling if present.** Recommended rule:
  - `DESCEND_VIA`: target = max(next AOA, assigned if assigned is a *bottom*? ) — simpler **v1 rule:** target altitude = the next `AT_OR_ABOVE` value while that fix is active (do not go below it); after sequencing, next constraint; after VECTORS, fly `assignedAltitudeFt` or last constraint if never assigned.
- After `nav.star.vectors`, clear `VIA_STAR` unless a CROSS remains.
- Tests: aircraft approaching ALPHA at 10000 with VIA must not go below 9000 before ALPHA; after ALPHA may descend toward 6000 but not below 6000 before BRAVO.
- Patch `_shared/command-ir.md` with the new variants, one parser-table row each, and a one-line validation note.

## Out of scope

- Localizer / GS (do not mix VIA with GS; GS ticket will override vertical).
- Speed restrictions on STAR.
- Published climb gradient / SID.
- Editing other `_shared` files.

## Implementation notes

Keep constraint math in `src/core/fms/vertical.ts` as a pure function:

```ts
function targetAltitudeFt(args: {
  assignedFt: number | undefined;
  vertical: VerticalMode;
  nextConstraint?: AltConstraint;
  onStar: boolean;
}): number
```

Pilot sets modes; `stepWorld` calls this each tick then uses existing climb/descend rates.

CROSS without being on the STAR: treat as “DIRECT that fix if not already, and meet restriction by the time it sequences.” If not DIRECT/PROCEDURE to that fix, reject (`unable, not on course to ALPHA`) **or** auto-DIRECT. Prefer **reject** so the controller must `DCT` first — simpler and testable.

Climb-via: same helper, invert AOA vs AOB. A unit test with a fake two-leg climb is enough; KDEM need not ship a SID.

Event (optional): `nav.constraint.met` with fixId.

## Acceptance criteria

- [ ] **AC1 —** `Instruction` union and `phases/_shared/command-ir.md` both include `DESCEND_VIA` and `CROSS` (and `CLIMB_VIA` if implemented). Same PR.
- [ ] **AC2 —** Given an aircraft on DEM1 before ALPHA at 10000 ft, `VIA DEM1` accepted, when stepped to ALPHA, then altitude `>= 9000` at sequence time (tolerance 100 ft).
- [ ] **AC3 —** Given the same, after ALPHA sequenced and before BRAVO, altitude may be `< 9000` but `>= 6000` at BRAVO sequence (tolerance 100 ft).
- [ ] **AC4 —** Given `DAL123 DCT ALPHA` then `X ALPHA 40`, when ALPHA sequences, altitude is within 200 ft of 4000 (AT).
- [ ] **AC5 —** Given `VIA NOPE` or `X ZZZZ 30`, when issued, then `command.rejected`, no vertical mode change.
- [ ] **AC6 —** Automated tests for AC2–AC5. DOM-free.

## Test plan

- Unit: `targetAltitudeFt` for AOA/AT/AOB.
- Integration: World fixture on DEM1; VIA; CROSS.
- Manual: spawn (or place) at ALPHA, `VIA DEM1`, watch Mode C vs 90/60/40.

## Suggested files

- `src/core/fms/vertical.ts`
- `src/core/fms/vertical.test.ts`
- `src/parse/` (VIA, X)
- `src/pilot/` (apply + readback)
- `phases/_shared/command-ir.md` (patch in implementation PR)
- `src/core/commandIr.ts` (or wherever T00-06 lives)
