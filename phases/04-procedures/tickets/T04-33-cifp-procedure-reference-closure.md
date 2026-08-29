# T04-33 CIFP procedure reference closure

**Phase:** 04 Procedures  
**Priority:** P0  
**Size:** M  
**Depends on:** T04-31  
**Blocks:** T04-34

## Goal

Complete a scenario catalog from the geographic seed without truncating
procedures. Selected procedures and their referenced fixes/navaids must travel
with the pack even when their coordinates fall outside the requested radius.

## Scope

- Accept selected airport/procedure policy:
  - airport plus all supported terminal procedures; or
  - explicit SID/STAR/approach identifiers from scenario metadata.
- Walk every supported procedure reference: SID/STAR leg fixes, runway
  transitions, navaid components, localizer/glideslope, FAF, threshold,
  missed fix, and transition references.
- Recursively include referenced records until closure is stable.
- Detect missing references, ambiguous identifiers, cross-airport leakage, and
  unsupported procedure elements. Fail or report according to explicit policy;
  never silently drop a required reference.
- Emit a deterministic, validated `ProcedureCatalog` pack with existing
  `files` layout and source lat/lon.
- Keep video-map IDs and authored spawn routes as metadata references, not
  copied procedure geometry.

## Out of scope

- New FMS behavior for unsupported procedure types.
- Radius-based deletion after closure.
- Runtime national catalog loading or browser network access.

## Acceptance criteria

- [ ] AC1 — A selected SID, STAR, or approach whose first or intermediate fix
  lies outside radius is complete in output.
- [ ] AC2 — Every emitted `fixId`, navaid component, approach reference, and
  missed fix resolves.
- [ ] AC3 — Closure is deterministic and terminates on cycles or repeated
  references.
- [ ] AC4 — Missing and ambiguous references produce actionable diagnostics
  naming procedure and source record.
- [ ] AC5 — Tests distinguish radius seed from final closure and prove unrelated
  airport procedures are excluded.
- [ ] AC6 — Existing KDEM catalog validation and current procedure tests stay
  green.

## Test plan

- Synthetic STAR with an entry fix outside seed radius.
- Synthetic SID with a runway transition fix outside seed radius.
- Approach with localizer/GS and missed fix references.
- Missing, duplicate, cyclic, and cross-airport reference cases.
- Snapshot or structural comparison of deterministic pack output.

## Suggested files

- `tools/cifp-import/closure.ts`
- `tools/cifp-import/closure.test.ts`
- `tools/cifp-import/catalogWriter.ts`
