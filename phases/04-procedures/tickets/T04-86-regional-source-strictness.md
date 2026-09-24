# T04-86 Regional source coverage and strict import failures

**Phase:** 04 Procedures (satellite traffic remediation)
**Priority:** P0
**Size:** L
**Depends on:** T04-69
**Blocks:** T04-87
**Merge target:** `feature/sattelite-traffic`
**Launch:** Implement this ticket only. Do not start downstream tickets.

## Goal

Make regional source coverage explicit and make strict import fail before any
output when required source data is missing, malformed, or lossy. Preserve the
existing offline developer-tool boundary and procedure-only pack behavior.

## Context

The audit found that the current regional source options expose APT/TWR but do
not make the required ATC/CLS_ARSP source coverage explicit, and that invalid
vertical limits are downgraded to warnings and removed. T04-69 already defines
explicit local source inputs and the FAA source families; this ticket completes
that contract without adding network access or guessing a vendor layout.

## Research

- **R11:** FAA CIFP product and readme: https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/cifp/
  and https://aeronav.faa.gov/Upload_313-d/cifp/CIFP%20Readme.pdf
- **R11:** FAA NASR subscription: https://www.faa.gov/air_traffic/flight_info/aeronav/Aero_Data/NASR_Subscription/
- Trainer delta: local authorized files produce deterministic trainer fixtures;
  the tool never downloads or claims certified airspace accuracy.

## Scope

- Extend the existing regional source options/manifest to identify APT, ATC,
  TWR, CIFP `UC`/`UR`, and `CLS_ARSP` coverage explicitly.
- Keep existing `--cifp`, `--nasr-apt`, and `--nasr-twr` forms; add an explicit
  `--nasr-cls-arsp` path only for the local product when that family is used.
- Treat missing required family coverage, invalid vertical units/limits,
  malformed geometry, and unrecoverable source loss as strict errors.
- Preserve source identity, line/record diagnostics, and no-partial-write
  behavior for both normal and dry-run regional commands.
- Update README and synthetic fixtures; do not commit real FAA cycles.

## Contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Regional command with explicit CIFP and NASR source paths | Source-family manifest is complete and deterministic | Provenance records each supplied family | Missing required family emits `MISSING_SOURCE_FAMILY` and writes nothing | R11 source-family descriptions |
| Supported `UC`/`UR` or CLS_ARSP airspace record | Normalized geometry and limits retained | Source identity and cycle preserved | Unsupported geometry emits named skip; no guessed line | CIFP Readme, current ARINC layout |
| Invalid/unknown vertical unit or lower > upper | Command exits nonzero before writing | No invalid volume serialized | Existing diagnostic code becomes strict error | CIFP Readme altitude rules |
| Missing/unreadable source file | Command exits nonzero | No output directory or partial files | Exact existing `MISSING_SOURCE_FILE` family error retained | Offline CLI review |
| `--dry-run` with invalid input | Diagnostics/report only | No files written | Same errors as write mode | Existing regional CLI contract |

## Acceptance criteria

- [ ] Source provenance distinguishes every required family and does not silently
  treat a missing ATC/TWR/CLS_ARSP source as complete metadata.
- [ ] Strict invalid vertical limits produce `error` diagnostics and abort before
  output; no invalid volume is merely filtered with a warning.
- [ ] Existing CLI forms remain compatible; the optional CLS_ARSP path is
  explicit when used and never inferred from a filename.
- [ ] Synthetic tests cover missing families, malformed records, unsupported
  geometry, invalid limits, unreadable paths, dry-run, and no partial writes.
- [ ] Procedure-only `cifp:pack` remains unchanged.
- [ ] `npm run ci` passes.

## Test plan

- Unit: source-family normalization, strict diagnostic severity, vertical-limit
  validation, and source provenance.
- Integration: regional CLI write/dry-run failure behavior using synthetic files.
- Manual: run an authorized local-source dry run and record product/cycle names;
  skip honestly when local source files are unavailable.

## Suggested files

- `tools/cifp-import/types.ts`
- `tools/cifp-import/nasr.ts`
- `tools/cifp-import/regionalSource.ts`
- `tools/cifp-import/regionalPack.ts`
- `tools/cifp-import/cli.ts`
- `tools/cifp-import/regionalSource.test.ts`
- `tools/cifp-import/regionalPack.test.ts`
- `tools/cifp-import/README.md`
- `testdata/cifp/`

## Out of scope

- Browser/runtime loading, VFR routing, Class B avoidance, or traffic behavior.
- Network downloads, FAA cycle commits, chart scraping, or a new vendor format.
