# CRC / vNAS STARS video-map source schema

Developer tool (T04-36). Parses **local** CRC ARTCC metadata into a normalized
video-map record that later tickets convert (T04-37) and group (T04-38).

This directory is **not** a runtime dependency of `stepWorld` or the Vite app.
Do not import it from `src/`. The browser never reads CRC files, never calls
vNAS, and never parses a national source pack.

## Identity (frozen)

| Field | Role |
| --- | --- |
| `id` | CRC ULID. Stable **internal** map identity. GeoJSON files are `<ULID>.geojson`. |
| `starsId` | CRC STARS map ID shown to controllers. Sparse. May duplicate across facilities. **Not** identity. |
| `CrcDcbGroupPosition` | Optional MAIN (`mainIndex` 0–5) or submenu (`submenuIndex` 0–31) layout. **Not** identity. Do not densify to 1–30. |

Facility-assigned inventory is `starsConfiguration.videoMapIds` (ULIDs). Maps
in that list stay in the inventory even when every DCB group omits them.

CRC `starsBrightnessCategory` **A** becomes later `map`; **B** becomes later
`mapDim`. Store the A/B flag here. BRITE later changes intensity, not
availability.

## Local source (never commit)

Frozen paths for this swarm. CLI flags in later tickets override.

- Metadata: `C:\Users\Ben\AppData\Local\CRC\ARTCCs\ZTL.json`
- Geometry: `C:\Users\Ben\AppData\Local\CRC\VideoMaps\ZTL\<ULID>.geojson`

Atlanta TRACON is `facility.childFacilities` id `A80`. Selection uses that
facility's `starsConfiguration.videoMapIds` plus maps tagged `A80` and
`STARS`. Complete assigned inventory is the ULID list, not a DCB-only subset.

Do **not** commit CRC cache JSON/GeoJSON, converter `out/`, secrets, or QA
screenshots. Intermediates go under `tools/crc-videomap-import/out/`
(gitignored) or `.crc/`. In-repo fixtures live in `testdata/crc-videomaps/`.

## Field mapping

CRC `videoMaps[]` → `NormalizedCrcVideoMap`:

| CRC | Normalized |
| --- | --- |
| `id` | `id` (ULID) |
| `starsId` | `starsId` |
| `name` | `title` |
| `shortName` | `shortName` |
| `sourceFileName` | `sourceFilename` |
| `starsBrightnessCategory` | `brightness` (`A` \| `B`) |
| `tdmOnly` | `tdm` |
| `tags` | `tags` |
| `starsAlwaysVisible` | `alwaysVisible` |
| `lastUpdatedAt` | `lastUpdatedAt` |

`starsConfiguration.mapGroups[]` stays source layout (`mapIds` are `starsId`
or `null`, plus `tcps`). T04-38 extracts MAIN/submenu semantics from that
shape. Group `mapIds` are never ULIDs and never become map identity.

## Map groups (T04-38)

`extractCrcFacilityGroups(artcc, facilityId)` walks a facility's
`mapGroups` into DCB layout without changing map identity.

- Source order, `tcps`, MAIN order (`mainIndex` 0–5), submenu order
  (`submenuIndex` 0–31), duplicate `starsId` slots, and `null` empty
  cells are preserved.
- Slot index is layout, not identity. Sparse CRC `starsId` values stay
  as-is. Do not densify to 1–30.
- Non-null `mapIds` resolve through assigned inventory `videoMapIds`
  (ULIDs keyed by `starsId`). ARTCC-wide `starsId` reuse is not
  ambiguity. Missing or duplicate `starsId` inside that inventory become
  diagnostics; the slot keeps `starsId` and omits `map`.
- Groups shorter than 38 slots are not padded. Source indexes ≥ 38 emit
  `SLOT_OUT_OF_RANGE` and are ignored.
- Assigned maps omitted from every group remain in `inventory` and
  `mapsAbsentFromGroups`.

Tests use `testdata/crc-videomaps/map-groups-*.json`. Live
`ARTCCs\ZTL.json` is optional local coverage and is never committed.

```text
import { extractCrcFacilityGroups } from "./groups.ts";
import { parseCrcArtccMaps } from "./parse.ts";
import { CRC_A80_FACILITY_ID } from "./paths.ts";

const artcc = parseCrcArtccMaps(json);
const groups = extractCrcFacilityGroups(artcc, CRC_A80_FACILITY_ID);
```

Runtime DCB wiring is T04-40. This tool does not import from `src/`.

## How to parse

Tests import `parseCrcArtccMaps` on `testdata/crc-videomaps/source-schema-fixture.json`.
No network. Production conversion later reads the local CRC path above.

```text
import { parseCrcArtccMaps } from "./parse.ts";
import { assignedVideoMaps } from "./identity.ts";
import { CRC_A80_FACILITY_ID } from "./paths.ts";

const artcc = parseCrcArtccMaps(json);
const a80 = artcc.starsFacilities.find((row) => row.facilityId === CRC_A80_FACILITY_ID);
```

KDEM remains the authored runtime default. Existing `src/scenario/video-maps/`
loading is unchanged until T04-40. T04-37 emits trainer `arp-enu-nm` files from
this CLI; the Vite app still does not import this directory.

## Conversion (T04-37)

Offline GeoJSON → trainer `VideoMapFile` JSON (`polyline` / `text` in
`arp-enu-nm`). Browser/runtime never reads CRC. `src/` must not import this
tool.

**Identity.** Output `id` is the CRC ULID (`NormalizedCrcVideoMap.id`).
`starsId` is recorded in `note` only. Do not densify to 1–30 or use a DCB
slot as `id`.

**ARP.** Conversion is parameterized by scenario ARP. KATL west-flow example
from `src/scenario/katl.json`: `latDeg 33.6367`, `lonDeg -84.4278638888889`.
Do not bake KATL ENU into reusable source GeoJSON.

**Geometry.** WGS84 `[lon, lat]` → `[eastNm, northNm]` via this tree's
`latLonToNm` (copied from `tools/cifp-import/coordinates.ts`). Supported:
LineString, MultiLineString, Polygon outlines (closed polylines, including
holes), Point with `properties.text`. Stroke-font labels stay polylines; no
OCR and no proprietary font.

**Cleanup.** Null geometry, empty coordinates, CRC default features
(`isLineDefaults` / `isTextDefaults` / `isSymbolDefaults`), `[0, 0]` vertices,
malformed coordinates, unsupported types (MultiPoint, GeometryCollection),
and Point symbols without text are skipped with deterministic diagnostics.
Maps that produce no valid features are not written.

**Brightness.** CRC A → `map`; B → `mapDim` (`crcBrightnessToVideoMapColor`).
Recorded in `note` (catalog wiring is T04-39). BRITE is later.

### CLI

From the repo root:

```text
npm run crc:videomaps -- --metadata <ARTCC.json> --maps <VideoMaps/ZTL> --arp-lat 33.6367 --arp-lon -84.4278638888889 --out tools/crc-videomap-import/out
```

`--arp LAT,LON` is accepted instead of `--arp-lat` / `--arp-lon`. `--dry-run`
prints map counts, feature counts, skipped-reason totals, and NM bounds; it
does not write files. `--out` is required unless `--dry-run`.

Local CRC examples (never commit these files):

```text
npm run crc:videomaps -- --metadata C:\Users\Ben\AppData\Local\CRC\ARTCCs\ZTL.json --maps C:\Users\Ben\AppData\Local\CRC\VideoMaps\ZTL --arp 33.6367,-84.4278638888889 --dry-run
```

Written files are `<ULID>.json` under `--out`. That directory is gitignored.
Do not commit generated A80 packs via this whole-ARTCC convert command (use
`pack` for T04-39). Tests use synthetic fixtures under
`testdata/crc-videomaps/geojson-*.json` and `convert-metadata.json`.

## Pack (T04-39)

`pack` filters conversion to the facility assigned `videoMapIds` UNION maps
tagged both `A80` and `STARS`. That is the complete inventory — not a DCB-group
subset. Maps omitted from every group stay in the pack. Catalog `id` is the CRC
ULID. `dcbNumber` is omitted (layout lives in `groups.json` for T04-40). Empty
maps are recorded in the manifest and are not written.

```text
npm run crc:videomaps -- pack --metadata <ARTCC.json> --maps <VideoMaps/ZTL> --arp 33.6367,-84.4278638888889 --out src/scenario/video-maps/KATL
```

`--facility` defaults to `A80`. `--icao` defaults to `KATL`. `--dry-run` prints
source/output/skipped/failure counts and writes nothing. Local CRC example:

```text
npm run crc:videomaps -- pack --metadata C:\Users\Ben\AppData\Local\CRC\ARTCCs\ZTL.json --maps C:\Users\Ben\AppData\Local\CRC\VideoMaps\ZTL --arp 33.6367,-84.4278638888889 --dry-run
```

Committed trainer output (never the local CRC cache) is
`src/scenario/video-maps/KATL/` — `catalog.json`, per-map JSON, `manifest.json`,
`groups.json`, and `ATTRIBUTION.md`. Tests use
`testdata/crc-videomaps/pack-metadata.json`.
