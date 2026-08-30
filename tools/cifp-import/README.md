# CIFP subset importer

Developer tool (T04-08 comma subset + T04-31 fixed-width ARINC 424-18). Converts
a **local** CIFP-like text file into the same `ProcedureCatalog` JSON schema
KDEM uses (`airportId: string`, navaids, fixes, STARs, approaches, SIDs).

**KDEM remains the runtime default.** The sim loads `src/scenario/data/kdem/`.
KDEM is a fictional field and **is not in CIFP**; do not try to replace Demo
Field with an import in v1.

This directory is **not** a runtime dependency of `stepWorld` or the Vite app.
Do not import it from `src/`. Runtime never parses ARINC 424.

`NormalizedCifpSource` (including `NormalizedSid` and SID runway/enroute
transition types) is the tool-only IR. T04-32 imports those types and exports
`selectByRadius` / `CifpRadiusSeed` for T04-33. Catalog `xNm` / `yNm` is
derived only at emit from the selected airport ARP. Source `latDeg` / `lonDeg`
is preserved on every point.

## Legal / source provenance

- **You** are responsible for CIFP/NASR terms of use. This tool does not grant
  redistribution rights. Keep the real cycle on disk outside git.
- **Do not scrape charts** (Jeppesen, ForeFlight, FAA PDF plates, or any web
  procedure page).
- **Do not commit a full FAA CIFP/NASR cycle** (or any national derived dump)
  into this repo. Input CIFP stays local / gitignored (`.cifp/`). Only
  synthetic reviewable fixtures under `testdata/cifp/` belong in git.
- **The app never downloads CIFP.** There is no browser fetch, no CDN, and no
  `faa:update` script. A later ticket may write an official-source pack into
  `src/scenario/data/<ICAO>/` using this same schema.
- Official product page (documentation only — you download by hand if you have
  rights, you do not commit the cycle):
  https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/cifp/

## How to run

From the repo root, on a file already on disk:

```text
npm run cifp:import -- --in testdata/cifp/frozen-subset.cifp --out out/catalog.json
```

Fixed-width synthetic fixture:

```text
npm run cifp:import -- --in testdata/cifp/fixed-width-subset.cifp --out out/catalog.json
```

Equivalent:

```text
node --experimental-strip-types tools/cifp-import/cli.ts --in testdata/cifp/frozen-subset.cifp --out out/catalog.json
```

Node 22.6+ type-stripping is enough (no extra package). If you are on Node 20,
`npx tsx tools/cifp-import/cli.ts --in … --out …` works the same. Do not add a
paid service or network fetch.

`--in` is required. `--out` writes pretty-printed catalog JSON; omit it to print
JSON on stdout. Unknown / unsupported records are skipped; skip counts go to
stderr.

Tests import `parseCifpSubset` directly (no CLI, no network).

## Pack CLI (T04-34)

`cifp:import` still emits one catalog JSON file. `cifp:pack` writes the ICAO
folder layout (`catalog.json`, `vors.json`, `ndbs.json`, `ils.json`,
`fixes.json`, `procedures.json`, `sids.json`) through one generic pipeline:

parse (fixed-width) → `selectByRadius` → adapt `CifpRadiusSeed` to
`ClosureSeed` (`selected: { airports, runways, … }`) →
`closeProcedureReferences` / `catalogWriter`.

```text
npm run cifp:pack -- --in <local CIFP> --airport <ICAO> --radius <NM> [--sids …] [--stars …] [--approaches …] --out <dir> [--dry-run]
```

`--sids` is required to be accepted (comma-separated or repeated flags), same
as `--stars` and `--approaches`. If those three flags are omitted, policy is
`airport-all` for that airport. If any is present, policy is `explicit` and
omitted lists are empty.

`--dry-run` prints seed vs closure counts, unsupported records, and output
paths; it does not write. Missing `--in`, an invalid ICAO, or an invalid
radius fail before parse.

On Windows PowerShell, use `npm.cmd run cifp:pack -- ...` if the PowerShell
`npm` shim consumes forwarded `--in` flags. Direct Node invocation also works:

```text
node --experimental-strip-types tools/cifp-import/cli.ts pack --in <local CIFP> --airport <ICAO> --radius <NM> --out <dir> --dry-run
```

Pack requires **fixed-width** ARINC 424 CIFP. The comma subset still uses
`cifp:import`. Writes are deterministic pretty JSON. Radius is a seed only;
closure pulls SID/STAR/approach refs outside the circle. Video maps, spawns,
MVA, ATPA, and telephony are not generated.

Synthetic second-airport check (not KDEM):

```text
npm run cifp:pack -- --in testdata/cifp/faa-layout-subset.cifp --airport KSYN --radius 40 --out tools/cifp-import/out/ksyn --dry-run
```

```text
npm run cifp:pack -- --in testdata/cifp/fixed-width-subset.cifp --airport KSYN --radius 40 --out tools/cifp-import/out/ksyn --dry-run
```

## KATL data

`src/scenario/data/katl/` is the committed trainer catalog pack. Scenario JSON
(`src/scenario/katl.json` west flow RWY 26R, `src/scenario/katl-08.json` east
flow RWY 08L) loads that pack through generic `assertScenario` /
`loadCatalog`. Playable inventory lists KATL west/east configurations; KDEM
stays the default. Video maps stay absent — do not point KATL at KDEM maps.
Do not invent a national ATL dump.

Heading-only vector SID `ATL2` is omitted from the committed pack: remaining
CIFP legs were unsupported path terminators with no named-fix TF/IF/CF/DF
legs. Unsupported RF/hold/arc/PT/heading legs stay skipped; this pack does
not add FMS flying for those types.

`extract-katl-slice.ts` is a **thin wrapper**: default `--airport KATL` and
`--radius 40` only. It calls generic pack. No KATL parse branch.

To regenerate the pack from a **local** CIFP the developer already has
(cycle stays outside git, typically `.cifp/`):

```text
npm run cifp:pack -- --in .cifp/FAACIFP18 --airport KATL --radius 40 --out src/scenario/data/katl
```

or

```text
node --experimental-strip-types tools/cifp-import/extract-katl-slice.ts --in .cifp/FAACIFP18 --out src/scenario/data/katl
```

Add `--sids` / `--stars` / `--approaches` when a later scenario needs a named
subset. Maps, MVA, and ATPA stay hand-authored and are not written by this
tool. Never commit `FAACIFP18` or a national intermediate. Regenerating the
pack can re-emit heading-only `ATL2`; `loadCatalog` rejects SIDs with no
named-fix legs, so omit that SID before committing (same as this pack).

Manual pack-generation from an official cycle is **skipped** unless the
developer already has an authorized local CIFP file. CI uses synthetic
fixtures only. Do not claim FAA-cycle regeneration was tested.

## Pack integration (T04-35)

Runtime still loads `src/scenario/data/<dir>/` through `loadCatalog`. Packs
are interchangeable because they emit the same `files` layout and go through
`parseCatalogFiles` — the same parser `loadCatalog` uses. There is no second
catalog loader and `src/` does not import this tool.

Coverage:

- Playable inventory lists KDEM (default) and KATL west/east configurations.
  Listed scenarios load catalog through generic `loadCatalog`. Map-backed
  entries load video maps; KATL uses generic `videoMapSet: "KATL"` (T04-39).
  Authored trainer MVA is a uniform 3000 ft floor (not FAA source data).
- `testdata/catalog-packs/kbbb/` is a synthetic second-facility pack (not
  KDEM, not KATL). Loader tests parse it through `parseCatalogFiles`.
- `pack.integration.test.ts` packs a CIFP fixture whose SID/STAR/approach
  fixes sit outside a 20 NM seed, writes to a temp dir, and reloads through
  `parseCatalogFiles`. Far refs stay.
- KATL coverage is the committed `src/scenario/data/katl/` pack + scenario
  JSON + `extract-katl-slice.ts` + the reproduce commands above. Maps/MVA
  stay unauthored.

## Frozen fixtures

`testdata/cifp/frozen-subset.cifp` is **synthetic comma-separated** (T04-08). It
is not a real cycle extract. Geometry is KDEM-like near 0°N 0°E so the phase 0
ENU projector yields NEMAX ≈ (17, 12) NM, MERGE ≈ (10, 0), ILS 27 course 270,
etc. Expected catalog: `testdata/cifp/frozen-subset.expected.json`. That fixture
has no SID records worth converting; output `sids` is `[]`.

`testdata/cifp/fixed-width-subset.cifp` is **synthetic 132-char ARINC 424-18**
(T04-31). Same KDEM-like geometry, plus a supported SID (`DEP1`) with a runway
transition constraint and lat/lon-preserved `SIDEP`.

`testdata/cifp/faa-layout-subset.cifp` is **synthetic FAA-column** packing
(HDR, DME-only `D` at columns 56/65, `PN`, hyphenated approach id). Use it to
prove `cifp:pack --dry-run` reaches radius seed selection without a real cycle.

Airport id in both fixtures is `KSYN` (schema check). Runtime still boots KDEM.

## Dialects

`parseCifpSubset` detects dialect from the first non-comment, non-`HDR` line:

- **Fixed-width:** 132-character records starting with `S`/`T` (real FAA CIFP
  ARINC 424-18). Parsed into `NormalizedCifpSource`, then emitted as
  `ProcedureCatalog`.
- **Comma-separated:** the T04-08 reviewable subset. Same section codes, packed
  lat/lon. **Real CIFP uses lat/lon only** — there is no `XNM`/`YNM` field.

Packed DMS:

- Latitude (9 chars): `N|S` + DD + MM + SS + hundredths (`N00120000` = 0°12′00.00″)
- Longitude (10 chars): `E|W` + DDD + MM + SS + hundredths

Real FAA files start with `HDR*` lines (skipped) then `SUSA` / `SCAN` records.
Section/subsection packing:

| Family | Section col 5 | Subsection | Examples |
| --- | --- | --- | --- |
| Airport | `P` (col 6 blank) | col 13 | `PA` airport, `PG` runway, `PC` terminal fix, `PI` localizer/GS, `PM` marker, `PE` STAR, `PD` SID, `PF` approach |
| Navaid / enroute | col 5–6 | col 6 | `D` VHF (blank sub), `DB` enroute NDB, `PN` terminal NDB, `EA` enroute fix |
| Skipped with counts | — | — | `ER` airway, `PP` path point, `PS` MSA, `AS` grid, `UR`/`UC` airspace, `HA`/`HC`/`HF` heliport, `PF`/`PD`/… continuation (`2`+ / letters) |

VHF navaid (`D`) coordinates:

- VOR lat/lon at columns **33 / 42** when present (VOR / VORTAC / VOR-DME).
- If those 19 columns are blank (DME-only, TACAN, ILS/DME), DME lat/lon at
  **56 / 65** is required. Blank on both sides is still a parse error — the
  record is not dropped silently.
- ILS/DME class (` I…` / leading `I`) keeps kind `DME` and suffixes the ident
  (`IATL` → `IATLDME`) so it does not collide with the `PI` localizer ident.
- Enroute VHF/NDB/fix identity includes ICAO region (columns 20–21) so two
  `AA` NDBs in `K3` and `K7` are distinct source rows. Catalog emit then keeps
  the copy closer to the selected ARP when ids would collide.

Approach / SID / STAR identifiers may include hyphens (`H10-Z`, `RNV-A`).
Point idents stay `[A-Z0-9]{2,8}`.

`testdata/cifp/faa-layout-subset.cifp` is a **synthetic** FAA-column fixture
(HDR, DME-only `D`, `PN`, hyphenated `PF`, continuation). Not a real cycle.

### Comma-separated record types

| Type | Meaning | Fields |
| --- | --- | --- |
| `PA` | Airport | `PA,<icao>,<name>,<lat>,<lon>,<magVarDeg>,<elevFt>` |
| `D` | VOR / VOR/DME | `D,<id>,<name>,VOR\|VORDME,<lat>,<lon>,<freqMhz>,<class T\|L\|H>` |
| `DB` | NDB | `DB,<id>,<name>,<lat>,<lon>,<freqKhz>` |
| `PC` / `EA` | Terminal / enroute waypoint | `PC,<id>,<kind>,<lat>,<lon>` (`kind`: WAYPOINT, INTERSECTION, FAF, MAPT, THRESHOLD) |
| `PI` | Localizer | `PI,<id>,<name>,<lat>,<lon>,<freqMhz>,<courseDeg>[,lengthNm][,beamHalfWidthDeg]` |
| `GS` | Glideslope (subset continuation; real CIFP encodes GS on PI continuations) | `GS,<id>,<name>,<lat>,<lon>,<freqMhz>,<gsAngleDeg>[,tchFt]` |
| `PE` | STAR | see below |
| `PF` | Approach | see below |

Unknown comma types (`ER` airways, `PD` SIDs, garbage lines) are **skipped**
with a count. The comma dialect does not parse SID encodings; `sids` is `[]`
when the source has no supported SID (as in `frozen-subset.cifp`). `#` comments
and blank lines are ignored (not skips).

STAR altitude/speed qualifiers: `+` / `A` / `AT_OR_ABOVE`, `-` / `B` /
`AT_OR_BELOW`, `@` / `AT`.

STAR records:

```text
PE,H,<icao>,<starId>,<starName>
PE,T,<starId>,<transId>,<transName>
PE,L,<starId>,<fixId>,<altQual>,<altFt>[,<spdQual>,<spdKt>]
PE,C,<starId>
PE,L,<starId>,<fixId>,…
PE,E,<starId>,VECTORS
```

Approach (`PF`):

```text
PF,<icao>,<appId>,<type>,<runway>,<name>,<locId>,<gsId>,<fafId>,<thrId>,<courseDeg>[,lengthNm][,beam][,gsAngle][,tch][,fafDist][,gsIntAlt][,daFt][,missHdg][,missClimb][,missFix]
```

ILS defaults when omitted: loc length **18 NM**, beam **2.5°**, TCH **50 ft**.

Every STAR/SID/approach `fixId` / navaid ref must exist or convert throws.
Duplicate / conflicting fixed-width identities throw with airport/section
context.

### Fixed-width ARINC subset (T04-31)

Primary records only. Continuation records (continuation number `2`+ or a
letter; `0`/`1` are primary) are counted as skips (`PA-CONT`, `PD-CONT`,
`PF-CONT`, …). Payload on those rows is not merged.

| Section | Meaning |
| --- | --- |
| `PA` | Airport |
| `PG` | Runway |
| `D` / `DB` / `PN` | VHF navaid / enroute NDB / terminal NDB |
| `EA` / `PC` | Enroute / terminal fix (`ENRT` region is not an airport id) |
| `PI` / `PM` | Localizer + glideslope / marker (`PM` is absent from current FAA cycles) |
| `PE` | STAR |
| `PD` | Airport SID |
| `PF` | Approach |

Supported path terminators emitted as named-fix catalog legs: **IF, TF, CF,
DF**. Unsupported path terminators are counted (`skippedByType`) and **never**
emitted as straight TF legs: RF, holds (`HA`/`HF`/`HM`), DME arc (`AF`),
procedure turn (`PI`), plus heading/course-unterminated `CA`/`CD`/`CI`/`CR`/
`VA`/`VD`/`VI`/`VM`/`VR`/`FA`/`FC`/`FD`/`FM`. A SID/STAR whose remaining legs
are all unsupported is omitted (`EMPTY_SID` / `EMPTY_STAR`) rather than
aborting the pack.

SID (`PD`) route types mapped into `SidProcedure`:

| Route type | Bucket |
| --- | --- |
| `0`, `1`, `4` | Runway transition (`RW27` → `runwayId` `27`; `RW26B` stays grouped until emit) |
| `2`, `5` | Common route |
| `3`, `6` | Enroute transition |
| `T` / `F` / `S` / `M` | RNP / FMS / military: `RW*` → runway, empty trans → common, else enroute |

Other SID route-type letters (FAA `V` vector SIDs) are diagnosed
(`SKIPPED_SID_ROUTE`) and skipped. Empty `sids` only when the source has no
supported SID — not a hardcoded emit.

### Grouped runway identifiers (`B` = both)

FAA CIFP PG records name **physical** runways (`RW26L`, `RW26R`, `RW10`).
SID (`PD`) and STAR (`PE`) runway transitions may use suffix **`B`** (“both”)
when the same procedure applies to a parallel pair. There is no `RW26B` PG
row. Observed on real KATL (and nationally): `RW26B` / `RW27B` / `RW08B` /
`RW09B` sit next to `RW26L`/`RW26R` etc.

Generic matching (no airport-id branch):

| Procedure ref | PG records matched |
| --- | --- |
| `26B` / `RW26B` | `RW26L` and `RW26R` only |
| `27` / `RW27` | exact `RW27` / `27` only — **not** `27L`/`27R` |
| `26L` / `RW26L` | exact left only |

`B` does **not** include center (`C`) or water (`W`, e.g. PHNL `RW08W`).
Numeric base is padded (`9B` → `09L`/`09R`).

Catalog emit **expands** grouped SID runway transitions into concrete
`runwayId` rows (`26L` and `26R`) so runtime spawn matching (`26L`) works.
If a SID also has a more specific `26L` transition, that row wins and the
group fills only the remaining parallel. STAR `RW*` transitions keep the CIFP
transition id and set `runwayId` (single) or `runways` (group). STAR `ALL`
tags every PG runway at the airport.

Approaches (`PF`) at KATL use specific L/R ids (`I26L`). A `B` suffix is not
expanded into two approaches (duplicate approach ids). Closure still resolves
a `26B` approach runway ref to both PG rows if one appears.

Unsupported path terminators stay diagnostics / skips and are **never**
rewritten as TF legs.

See `testdata/cifp/grouped-runway.cifp` (synthetic) and
`buildGroupedRunwaySubset()`.

Approach route types mapped into catalog `ILS`/`LOC`/`RNAV`/`VOR`/`NDB`:
`I`; `L`/`B`/`X`/`T`/`G`; `R`/`H`/`P`/`F`/`J`; `V`/`S`/`D`; `N`/`Q`.
`A` (transition) and `Z` (missed) do not set type; a later final-approach
row updates it. MLS/TACAN letters `K`/`U`/`W`/`Y` are skipped
(`SKIPPED_APPROACH_ROUTE`).

SID *catalog conversion* is in scope. SID *flight behavior* is not; the FMS
does not gain new RNAV/hold/RF flying from this tool.

Still unsupported (counted skips, not silent drops of supported rows):
airways, MSA, path points, airspace, heliport procedures, continuation
payloads, RF/hold/arc/PT flying. Marker (`PM`) rows parse when present.

## Out of scope

Full ARINC 424 (holds, RF flying, procedure turns, DME arcs, continuation
payloads). RNAV (RNP) flying. Live FAA download. Chart scrape. Replacing KDEM as
the default scenario. KATL video maps. SID
*flight* behavior for imported rows.

## Geographic radius seed (T04-32)

`selectByRadius(source, { airportId, radiusNm })` in `spatialIndex.ts` builds a
`CifpRadiusSeed` for T04-33. `--airport` / `--radius` CLI flags are T04-34 pack
wiring; this ticket owns the selection API and seed type only.

- **Units:** `radiusNm` is nautical miles. Origin is the selected airport ARP
  (`latDeg` / `lonDeg`). Distance is great-circle (haversine), including
  longitude wrap near ±180°. The boundary is inclusive (`distance <= radiusNm`).
- **Not closure:** a selected SID, STAR, or approach may still name fixes
  outside the radius. Those fixes stay out of the seed. T04-33 walks
  procedure references. Do not treat the seed as a complete procedure pack.
- **Coordinates:** source `latDeg` / `lonDeg` only. No ENU / `xNm` / `yNm` in
  the seed or index.
- **National files:** `.cifp/` and `tools/cifp-import/out/` are gitignored.
  Do not commit a national CIFP cycle or a derived national source/index.
  Generated temp output stays local. Vite and `src/` never import this tool.
- **Determinism:** selected arrays are sorted by `identity.key`.
  `serializeRadiusSeed` is stable pretty JSON for temp intermediates.

## Procedure-reference closure (T04-33)

Radius around ARP is a **seed**, not a procedure boundary. `closeProcedureReferences`
walks selected SID, STAR, and approach records — including **SID runway
transitions**, common / enroute legs, STAR transitions, and approach loc / GS /
FAF / threshold / missed — and pulls missing fixes and navaids from the **full**
`NormalizedCifpSource`. A required reference is never dropped silently.

Policy:

- `airport-all` — selected airport plus every supported terminal procedure there
- `explicit` — SID / STAR / approach identifiers from scenario metadata

Seed input is duck-typed (`ClosureSeed` in `closure.ts`) so T04-32's later
radius object can be assigned without this module importing `spatialIndex.ts`.
`radiusNm` is metadata only; this ticket does not implement great-circle
selection.

Missing, ambiguous, and cross-airport references become diagnostics that name
the procedure and source record (`onError: "fail"` throws; `"report"` returns
them). Unsupported path terminators are reported the same way and stay skips,
not TF legs.

`catalogWriter.ts` emits the existing ICAO `files` layout (`catalog.json`,
`vors.json`, `ndbs.json`, `ils.json`, `fixes.json`, `procedures.json`,
`sids.json`) via `emitCatalogFromSource` after closure. Source `latDeg` /
`lonDeg` is preserved. Video-map ids and authored spawn routes are not copied
as procedure geometry. ATPA volumes are omitted unless the catalog already
has rows.
