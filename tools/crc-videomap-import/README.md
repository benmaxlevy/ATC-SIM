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
loading is unchanged. This tool does not emit trainer `arp-enu-nm` catalogs.
