# T04-69 FAA regional airport and airspace import

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-34
**Blocks:** T04-70
**Launch:** Implement this ticket only. Do not start T04-70 or traffic/navigation work.

## Goal

Extend the local CIFP/NASR generator boundary so a regional pack can import
airport operational metadata and controlled-airspace geometry from local FAA
source files. The importer must preserve source coordinates, vertical units,
source identity, and loss diagnostics; it must never manufacture recoverable
FAA data when a source field or source file is unavailable.

## Context

The existing fixed-width parser handles airports, runways, navaids, fixes, and
procedures, but `UC` and `UR` records currently become generic skipped records.
The existing KATL catalog was generated through the CIFP procedure pipeline,
but it has no generated regional airport eligibility or Class B avoidance data.
T04-70 needs one deterministic source model for KATL and for a synthetic second
region. `src/` must not import this tool, and KDEM must remain independent of
FAA input.

## Research

- **R11 / FAA CIFP product:**
  https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/cifp/
  The product page lists airports, runways, navaids, waypoints, procedures,
  and Class B/C/D airspace among the data elements.
- **FAA CIFP Readme, ARINC 424 record types, pp. 2--5:**
  https://aeronav.faa.gov/Upload_313-d/cifp/CIFP%20Readme.pdf
  It identifies `UC` as Class B/C/D airspace and `UR` as special-use airspace;
  it documents controlled-airspace names/centers, the `GND` altitude unit
  indicator, and source boundary caveats. Implementers must use the current
  readme and ARINC layout for field positions. This ticket intentionally does
  not assert unverified column offsets.
- **FAA NASR subscription:**
  https://www.faa.gov/air_traffic/flight_info/aeronav/Aero_Data/NASR_Subscription/
  The subscription lists APT, ATC, TWR, CLS_ARSP, and Class B/C/D shape-file
  products. These local files provide airport public-use and tower/controlled
  status that CIFP procedure data alone does not guarantee.
- **Trainer delta:** source products are used to create deterministic training
  fixtures only. This is not an FAA-certified airspace database, and it does
  not authorize real-world navigation.

## Scope

- Extend the tool-only normalized source model with:
  - airport service metadata matched by ICAO, including public-use status,
    tower/controlled status, and source references. CIFP-only rows retain
    `undefined` for fields NASR did not provide; missing is never coerced to
    `false`.
  - controlled/special-use airspace records with stable source identity,
    class/kind, name, center/owning airport when supplied, boundary segments or
    closed rings, lower/upper altitude values, altitude reference/unit, and
    source line/record references.
  - provenance for each source family and effective cycle/date when the local
    file provides it.
- Parse supported fixed-width `UC` Class B/C/D and `UR` records using the
  current FAA CIFP Readme/ARINC layout. Preserve arcs or other source geometry
  until a later deterministic projection step; unsupported segment forms must
  remain explicit diagnostics and must not become straight segments.
- Add a local NASR adapter for the supplied APT/ATC/TWR and, when requested,
  Class B/C/D airspace source files. Use an explicit source manifest or file
  arguments so the tool does not guess a vendor layout. Match records by
  normalized ICAO/FAA identifier and report missing, duplicate, conflicting,
  and unmatched rows.
- Add a regional-source input contract to the developer CLI while preserving
  the existing procedure-only `cifp:pack` behavior. The regional mode must
  accept a local CIFP path plus explicit local NASR source paths/manifest,
  center airport, and radius in NM. It must support dry-run diagnostics and
  write no output when required input validation fails.
- Select airports and airspace by the existing great-circle radius seed, with
  geometry-aware inclusion for a volume intersecting the region. Keep source
  latitude/longitude in the intermediate model; do not produce scenario ENU
  coordinates in this ticket.
- Emit deterministic diagnostics/counts for parsed, selected, unsupported,
  malformed, duplicate, and excluded records. Include source identity and line
  or record number where available.
- Add synthetic fixtures only: at least one Class B/C/D volume with vertical
  limits, one supported boundary arc/segment case, one malformed/unsupported
  case, and airport rows that distinguish towered public-use, untowered,
  private, and missing NASR metadata. Do not add real KATL/NASR/CIFP cycles.
- Update `tools/cifp-import/README.md` with local-source arguments, source
  provenance requirements, supported record families, geometry/altitude loss
  diagnostics, and the no-network/no-cycle-in-git boundary.

## Out of scope

- Browser/runtime loading, VFR routing, Class B avoidance, zone weights, or
  traffic request behavior; T04-70 and later tickets consume this source model.
- Downloaders, live FAA/NASR APIs, browser fetches, scheduled cycle updates, or
  committing a real CIFP/NASR file or derived national dump.
- Hand-authored KATL airport lists, runway positions, airspace polygons,
  ceilings/floors, tower status, or destination eligibility overrides.
- Video maps, MVA/ATPA data, chart scraping, procedure flying, landing logic,
  or changes to KDEM fixtures.
- Inferring `towered` or `publicUse` solely from an ICAO prefix, a CIFP PA row,
  the presence of a procedure, a weather-airport list, or a Class B/C/D
  geometry row.

## Implementation notes

- Keep CIFP normalized coordinates as `latDeg`/`lonDeg`. The source model may
  retain raw altitude/unit codes beside parsed values so a later consumer can
  distinguish MSL, AGL, and surface limits. Reject invalid or ambiguous limits
  in strict regional mode; do not silently convert an unknown reference.
- Use stable keys that distinguish the source family, source record identity,
  airport/airspace owner, and geometry component. Sort emitted arrays by those
  keys so equivalent input order produces equivalent JSON and diagnostics.
- A source record that cannot be represented by the selected geometry model is
  reported with a skip code naming the record and reason. It is never emitted
  as a guessed straight-line boundary. A volume with incomplete required
  geometry or vertical limits is excluded from regional output and causes
  strict regional generation to fail when it is needed for the requested
  center/radius.
- NASR enrichment is authoritative for the `publicUse`/`towered` fields used
  by T04-70. A CIFP PA row may remain in the generic source and procedure pack
  when NASR enrichment is absent, but regional eligibility generation must fail
  with a source-availability diagnostic instead of marking it eligible.
- The importer remains a developer tool. No file under `src/` may import
  `tools/cifp-import`.

## Acceptance contract table

| Input/form | Expected action/result | State/side effect | Rejection/edge case | Manual evidence |
| --- | --- | --- | --- | --- |
| Local fixed-width CIFP containing a supported `UC` Class B record | Parse one normalized controlled-airspace record with source identity, class, boundary, and vertical limits | Source arrays and diagnostics are deterministic; no ENU projection | Malformed field yields a named error diagnostic and no partial regional record | FAA CIFP Readme pp. 2--5; current ARINC layout |
| Local CIFP containing `UR` special-use records | Preserve supported source geometry and kind, or report an explicit unsupported-record diagnostic | `UR` is never mislabeled Class B/C/D | Unsupported arc/continuation/altitude form is skipped with record identity; never flattened silently | FAA CIFP Readme pp. 4--5 |
| NASR APT + ATC/TWR rows matching `KAAA` | Enrich the airport row with public-use/towered status and source references | `KAAA` becomes eligible metadata input for T04-70 | Missing or conflicting match stays unresolved and emits a deterministic diagnostic | NASR subscription APT/ATC/TWR product descriptions |
| CIFP PA row with no NASR companion | Keep procedure-source airport facts; leave operational flags unknown | No eligibility boolean is fabricated | Strict regional mode fails or excludes the row with `MISSING_AIRPORT_SERVICE_METADATA`; no output is written | NASR is required for operational status |
| Duplicate NASR rows with identical payload | Keep one row and emit a duplicate warning | Stable result independent of duplicate order | Conflicting payload emits an error naming both source records | Importer diagnostic report |
| Airspace boundary crossing the radius while no vertex is inside | Select the volume using geometry-aware region intersection | Selected count includes the volume once | Invalid/empty geometry is diagnosed and excluded | FAA source geometry review |
| `GND`/AGL, MSL, or unknown altitude unit | Preserve supported unit/reference and parsed value | No silent unit conversion | Unknown or inconsistent lower/upper limits fail strict regional selection | FAA CIFP Readme pp. 4--5 |
| Regional CLI with missing CIFP/NASR path or unreadable local file | Exit nonzero with actionable source-availability diagnostics | No output directory or partial pack is written | Must not fall back to hand-authored KATL data or procedure-only eligibility | Local dry-run/manual check |

## Acceptance criteria

- [ ] **AC1 —** Fixed-width synthetic CIFP tests parse supported `UC` Class B/C/D
  records into a normalized source model with source coordinates, vertical
  references, identity, and deterministic diagnostics.
- [ ] **AC2 —** Supported `UR` records and geometry components are either
  preserved generically or reported as explicit, source-identified skips;
  unsupported geometry never becomes a guessed straight edge.
- [ ] **AC3 —** Synthetic NASR APT/ATC/TWR input enriches matching airport rows;
  public-use/towered fields remain unknown when NASR metadata is absent, and
  conflicting/unmatched rows produce actionable diagnostics.
- [ ] **AC4 —** Radius selection includes a volume whose boundary intersects the
  radius without requiring a vertex inside it, preserves airport ownership,
  and remains deterministic under input reordering.
- [ ] **AC5 —** Regional mode fails before writing when required local source
  files, required metadata, coordinates, or vertical limits are unavailable;
  procedure-only pack mode retains its existing behavior.
- [ ] **AC6 —** Synthetic fixtures cover Class B/C/D, special-use, altitude
  units, malformed records, duplicate/conflict rows, unsupported geometry, and
  towered/public-use versus missing metadata.
- [ ] **AC7 —** The importer README documents the official source families,
  provenance/effective-cycle responsibility, supported/lost records, and no
  network/no-cycle-in-git boundary.
- [ ] **AC8 —** No runtime or browser module imports `tools/cifp-import`, and
  KDEM data/tests remain unchanged.

## Test plan

- Unit: fixed-width UC/UR field parsing, altitude/reference decoding, geometry
  components, source identity, duplicate/conflict diagnostics, and NASR row
  enrichment using synthetic minimal fixtures.
- Integration: regional source manifest parsing, radius/geometry selection,
  deterministic report ordering, strict missing-source failure, and unchanged
  procedure-only pack tests.
- Manual: with an authorized local FAA cycle and NASR subscription, run the
  regional dry-run for KATL at `40 NM`; verify reported source files/cycles,
  selected airport/airspace counts, unsupported-record report, and no writes
  on a missing-source run. Record the exact source cycle; do not claim this
  review when no authorized local files exist.

## Suggested files

- `tools/cifp-import/types.ts`
- `tools/cifp-import/arincLayout.ts`
- `tools/cifp-import/parseFixedWidth.ts`
- `tools/cifp-import/nasr.ts`
- `tools/cifp-import/regionalSource.ts`
- `tools/cifp-import/spatialIndex.ts`
- `tools/cifp-import/pack.ts`
- `tools/cifp-import/cli.ts`
- `tools/cifp-import/fixedWidthRecords.ts`
- `tools/cifp-import/*regional*.test.ts`
- `tools/cifp-import/README.md`
- `testdata/cifp/` (synthetic fixtures only)
