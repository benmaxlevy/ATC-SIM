# T04-37 CRC GeoJSON converter

**Goal:** Build an offline deterministic converter from CRC/vNAS GeoJSON into ATC-SIM `arp-enu-nm` video-map files.

## Source

Read local `C:\Users\Ben\AppData\Local\CRC\VideoMaps\ZTL\` files and metadata
from `C:\Users\Ben\AppData\Local\CRC\ARTCCs\ZTL.json`. Never fetch source data
from the browser or vNAS.

## Acceptance criteria

- [ ] CLI accepts source metadata, map directory, scenario ARP, and output directory.
- [ ] WGS84 `[lon, lat]` converts through existing `latLonToNm` into `[eastNm, northNm]`.
- [ ] LineString, MultiLineString, Polygon outlines, and Point text convert deterministically.
- [ ] Null, empty, default, malformed, and zero-coordinate features produce explicit diagnostics and no invalid output.
- [ ] CRC A maps to `map`; B maps to `mapDim`.
- [ ] Stroke-font labels remain polylines; no OCR or proprietary font dependency.
- [ ] Synthetic fixtures cover all supported geometry and cleanup cases.
- [ ] CLI dry-run reports map counts, feature counts, skipped data, and NM bounds.

## Out of scope

Full A80 generation, runtime loading, map groups, rendering optimization, and chart scraping.

## Test plan

Run converter tests and `npm run ci` before each commit.
