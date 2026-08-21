# CIFP subset importer

Developer tool (T04-08). Converts a **local** CIFP-like text file into the same
`ProcedureCatalog` JSON schema KDEM uses (`airportId: string`, navaids, fixes,
STARs, approaches, `sids: []`).

**KDEM remains the runtime default.** The sim loads `src/scenario/data/kdem/`.
KDEM is a fictional field and **is not in CIFP**; do not try to replace Demo
Field with an import in v1.

This directory is **not** a runtime dependency of `stepWorld` or the Vite app.
Do not import it from `src/`.

## Legal / what not to do

- **Do not scrape charts** (Jeppesen, ForeFlight, FAA PDF plates, or any web
  procedure page).
- **Do not commit a full FAA CIFP/NASR cycle** (or any non-redistributable FAA
  product) into this repo.
- **The app never downloads CIFP.** There is no browser fetch, no CDN, and no
  `faa:update` script in this ticket. A later ticket may add an official-source
  writer into `src/scenario/data/<ICAO>/` using this same schema.
- Official product page (documentation only — you download by hand if you have
  rights, you do not commit the cycle):
  https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/cifp/
- **You** are responsible for CIFP/NASR terms of use. This tool does not grant
  redistribution rights.

## How to run

From the repo root, on a file already on disk:

```text
npm run cifp:import -- --in testdata/cifp/frozen-subset.cifp --out out/catalog.json
```

Equivalent:

```text
node --experimental-strip-types tools/cifp-import/cli.ts --in testdata/cifp/frozen-subset.cifp --out out/catalog.json
```

Node 22.6+ type-stripping is enough (no extra package). If you are on Node 20,
`npx tsx tools/cifp-import/cli.ts --in … --out …` works the same. Do not add a
paid service or network fetch.

`--in` is required. `--out` writes pretty-printed catalog JSON; omit it to print
JSON on stdout. Unknown record types are skipped; skip counts go to stderr.

Tests import `parseCifpSubset` directly (no CLI, no network).

## Frozen fixture

`testdata/cifp/frozen-subset.cifp` is **synthetic**. It is not a real cycle
extract. Geometry is KDEM-like near 0°N 0°E so the phase 0 ENU projector yields
NEMAX ≈ (17, 12) NM, MERGE ≈ (10, 0), ILS 27 course 270, etc. Expected catalog:
`testdata/cifp/frozen-subset.expected.json`.

Airport id in the fixture is `KSYN` (schema check). Runtime still boots KDEM.

## Dialect (documented subset)

Real CIFP is fixed-width ARINC 424. This importer accepts a **comma-separated**
subset with the same section codes, documented here so the fixture stays
reviewable. **Real CIFP uses lat/lon only** — there is no `XNM`/`YNM` field.

Lat/lon fields are ARINC-style packed DMS:

- Latitude (9 chars): `N|S` + DD + MM + SS + hundredths (`N00120000` = 0°12′00.00″ → 12 NM north of 0°N)
- Longitude (10 chars): `E|W` + DDD + MM + SS + hundredths

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

Unknown types (`ER` airways, `PD` SIDs, garbage lines) are **skipped** with a
count. SIDs are not imported; output `sids` is always `[]`. `#` comments and
blank lines are ignored (not skips).

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

Every STAR/approach `fixId` / navaid ref must exist or convert throws. Duplicate
ids throw.

## Out of scope

Full ARINC 424 (holds, RF, procedure turns, SID encodings, continuation
records). RNAV (RNP) flying. Live FAA download. Chart scrape. Replacing KDEM as
the default scenario.
