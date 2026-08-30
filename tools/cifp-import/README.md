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
npm run cifp:pack -- --in testdata/cifp/fixed-width-subset.cifp --airport KSYN --radius 40 --out tools/cifp-import/out/ksyn --dry-run
```

## KATL data (none committed)

There is **no** `src/scenario/data/katl/` trainer pack in git. Playable
inventory stays KDEM-only. Do not invent a national ATL dump. Do not add KATL
to `playable-scenarios.json` until a reviewed pack exists.

`extract-katl-slice.ts` is a **thin wrapper**: default `--airport KATL` and
`--radius 40` only. It calls generic pack. No KATL parse branch.

To reproduce a committed pack from a **local** CIFP the developer already has
(cycle stays outside git, typically `.cifp/`):

```text
npm run cifp:pack -- --in .cifp/FAACIFP18 --airport KATL --radius 40 --out src/scenario/data/katl
```

or

```text
node --experimental-strip-types tools/cifp-import/extract-katl-slice.ts --in .cifp/FAACIFP18 --out src/scenario/data/katl
```

Add `--sids` / `--stars` / `--approaches` when a later scenario needs a named
subset. Maps, spawns, and MVA stay hand-authored and are not written by this
tool. Never commit `FAACIFP18` or a national intermediate.

Manual pack-generation from an official cycle is **skipped** unless the
developer already has an authorized local CIFP file. CI uses synthetic
fixtures only. Do not claim FAA-cycle regeneration was tested.

## Pack integration (T04-35)

Runtime still loads `src/scenario/data/<dir>/` through `loadCatalog`. Packs
are interchangeable because they emit the same `files` layout and go through
`parseCatalogFiles` — the same parser `loadCatalog` uses. There is no second
catalog loader and `src/` does not import this tool.

Coverage:

- Playable inventory is KDEM-only. Every listed scenario loads catalog +
  video maps + authored MVA/spawns through generic loaders.
- `testdata/catalog-packs/kbbb/` is a synthetic second-facility pack (not
  KDEM, not KATL). Loader tests parse it through `parseCatalogFiles`.
- `pack.integration.test.ts` packs a CIFP fixture whose SID/STAR/approach
  fixes sit outside a 20 NM seed, writes to a temp dir, and reloads through
  `parseCatalogFiles`. Far refs stay.
- KATL coverage is this generic path + `extract-katl-slice.ts` + the
  reproduce commands above. `src/scenario/data/katl/` is not in git.

## Frozen fixtures

`testdata/cifp/frozen-subset.cifp` is **synthetic comma-separated** (T04-08). It
is not a real cycle extract. Geometry is KDEM-like near 0°N 0°E so the phase 0
ENU projector yields NEMAX ≈ (17, 12) NM, MERGE ≈ (10, 0), ILS 27 course 270,
etc. Expected catalog: `testdata/cifp/frozen-subset.expected.json`. That fixture
has no SID records worth converting; output `sids` is `[]`.

`testdata/cifp/fixed-width-subset.cifp` is **synthetic 132-char ARINC 424-18**
(T04-31). Same KDEM-like geometry, plus a supported SID (`DEP1`) with a runway
transition constraint and lat/lon-preserved `SIDEP`.

Airport id in both fixtures is `KSYN` (schema check). Runtime still boots KDEM.

## Dialects

`parseCifpSubset` detects dialect from the first non-comment line:

- **Fixed-width:** 132-character records starting with `S`/`T` (real CIFP
  shape). Parsed into `NormalizedCifpSource`, then emitted as `ProcedureCatalog`.
- **Comma-separated:** the T04-08 reviewable subset. Same section codes, packed
  lat/lon. **Real CIFP uses lat/lon only** — there is no `XNM`/`YNM` field.

Packed DMS:

- Latitude (9 chars): `N|S` + DD + MM + SS + hundredths (`N00120000` = 0°12′00.00″)
- Longitude (10 chars): `E|W` + DDD + MM + SS + hundredths

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

Primary records only. Continuation records are counted as skips (`PA-CONT`,
`PD-CONT`, …).

| Section | Meaning |
| --- | --- |
| `PA` | Airport |
| `PG` | Runway |
| `D` / `DB` / `PN` | VHF navaid / NDB |
| `EA` / `PC` | Enroute / terminal fix |
| `PI` / `PM` | Localizer + glideslope / marker |
| `PE` | STAR |
| `PD` | Airport SID |
| `PF` | Approach |

Supported path terminators emitted as named-fix catalog legs: **IF, TF, CF,
DF**. Unsupported path terminators are counted (`skippedByType`) and **never**
emitted as straight TF legs: RF, holds (`HA`/`HF`/`HM`), DME arc (`AF`),
procedure turn (`PI`), plus heading/course-unterminated `CA`/`CD`/`CI`/`CR`/
`VA`/`VD`/`VI`/`VM`/`VR`/`FA`/`FC`/`FD`/`FM`.

SID (`PD`) route types mapped into `SidProcedure`:

| Route type | Bucket |
| --- | --- |
| `0`, `1`, `4` | Runway transition (`RW27` → `runwayId` `27`) |
| `2`, `5` | Common route |
| `3`, `6` | Enroute transition |
| `T` / `F` / `S` / `M` | RNP / FMS / military: `RW*` → runway, empty trans → common, else enroute |

Other SID route-type letters are diagnosed (`SKIPPED_SID_ROUTE`) and skipped.
Empty `sids` only when the source has no supported SID — not a hardcoded emit.

SID *catalog conversion* is in scope. SID *flight behavior* is not; the FMS
does not gain new RNAV/hold/RF flying from this tool.

## Out of scope

Full ARINC 424 (holds, RF flying, procedure turns, DME arcs, continuation
payloads). RNAV (RNP) flying. Live FAA download. Chart scrape. Replacing KDEM as
the default scenario. Committed KATL trainer pack (none ships). SID *flight*
behavior for imported rows.

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
