# T04-87 Regional pack invariants and portable provenance

**Phase:** 04 Procedures (satellite traffic remediation)
**Priority:** P0
**Size:** L
**Depends on:** T04-86
**Blocks:** T04-88, T04-90
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make generated and loaded regional packs obey the approved data contract. The
first KATL pack must use 40-NM coverage, portable provenance, complete airport
eligibility metadata, valid airspace types/rings, and unambiguous identifiers.

## Context

The audit found a committed 90-NM KATL manifest, an absolute workstation source
path, weak runtime eligibility checks, unchecked airspace types, insufficient
ring validation, and no complete duplicate-reference validation. This ticket
keeps the loader generic and data-first; it must not add KATL branches.

## Research

- **R11:** CIFP/NASR source constraints from T04-69 and FAA CIFP Readme:
  https://aeronav.faa.gov/Upload_313-d/cifp/CIFP%20Readme.pdf
- Trainer delta: regional geometry is a deterministic training approximation,
  not certified NAS airspace.

## Scope

- Validate manifest radius and regenerate KATL at 40 NM.
- Require `eligible` airports to have source-proven public-use/towered metadata,
  valid runway geometry, and a valid emitted catalog reference.
- Validate `CONTROLLED`/`SPECIAL_USE`, altitude ordering, duplicate IDs and
  catalog references, closed/nondegenerate rings, and supported boundary forms.
- Normalize committed source provenance to portable product/record identifiers;
  reject absolute local paths.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| KATL pack with `radiusNm: 40` | Loads and reports 40 NM | Existing generated data remains usable | 90-NM manifest rejected by contract test | T04-70 AC2 |
| Airport marked eligible | Loads only with public/towered proof, runway, and catalog ref | `getEligibleDestinations` can trust it | Missing/unknown field rejects or excludes | T04-70 eligibility rule |
| Unknown airspace `type` | Pack rejected | No unsafe cast | Only `CONTROLLED` or `SPECIAL_USE` accepted | Generic schema contract |
| Open/degenerate/invalid ring | Pack rejected with diagnostic | No unusable polygon reaches runtime | No empty-segment-only acceptance | T04-70 invalid-ring requirement |
| Duplicate airport/catalog/airspace ID | Pack rejected | Lookups remain deterministic | Conflicting references identify both records | Data-first loader contract |
| Absolute source path | Pack rejected or normalized before commit | Provenance remains portable | No `/home/...` or `C:\...` runtime path | Provenance review |

## Acceptance criteria

- [ ] `src/scenario/data/katl/regional.json` and generation command declare 40 NM.
- [ ] Loader validates the complete eligibility contract before accepting an
  airport as eligible.
- [ ] Loader rejects invalid airspace types, rings, altitude ranges, duplicate
  IDs, and duplicate catalog references with actionable diagnostics.
- [ ] Committed KATL provenance contains no workstation-specific absolute path.
- [ ] Synthetic malformed-pack tests prove all rejection paths without relying
  on production map counts or geometry.
- [ ] Generic second-airport loading remains supported.
- [ ] `npm run ci` passes.

## Test plan

- Unit: parser/schema validation with minimal airport and airspace fixtures.
- Integration: KATL data contract acceptance plus generic synthetic facility load.
- Manual: inspect generated manifest/provenance and record source-cycle evidence;
  no claim is made without authorized local source data.

## Suggested files

- `src/scenario/regional.ts`
- `src/scenario/regionalCatalogs.ts`
- `src/scenario/test/regional.test.ts`
- `src/scenario/test/atlantaRegionalAcceptance.test.ts`
- `tools/cifp-import/regionalPack.ts`
- `tools/cifp-import/regionalPack.test.ts`
- `src/scenario/data/katl/regional.json`
- `src/scenario/data/katl/regional-airports.json`
- `src/scenario/data/katl/regional-airspace.json`

## Out of scope

- New airport-specific loaders, facility branches, or live FAA downloads.
- Changes to KDEM, procedure flying, or the regional source parser beyond T04-86.
