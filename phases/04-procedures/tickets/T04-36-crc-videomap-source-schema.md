# T04-36 CRC videomap source schema

**Goal:** Define normalized metadata for importing permitted CRC/vNAS STARS video maps without conflating map identity with DCB placement.

## Source

Use local CRC metadata from `C:\Users\Ben\AppData\Local\CRC\ARTCCs\ZTL.json`.
Map geometry is resolved from `C:\Users\Ben\AppData\Local\CRC\VideoMaps\ZTL\<ULID>.geojson`.
Atlanta TRACON/A80 selection comes from `facility.childFacilities[0].starsConfiguration.videoMapIds`
and `videoMaps[].tags`.

## Acceptance criteria

- [ ] Normalized record preserves CRC ULID, `starsId`, title, short name, source filename, A/B brightness, TDM, and tags.
- [ ] Stable internal map identity is separate from `starsId`.
- [ ] Optional DCB group position is separate from map identity; no dense renumbering.
- [ ] Schema supports every source map needed by later conversion and group extraction.
- [ ] Unit fixtures cover sparse IDs, duplicate short names, missing source metadata, and TDM flags.
- [ ] Existing KDEM/KATL video-map loading remains unchanged.

## Out of scope

Geometry conversion, runtime vNAS access, DCB UI, and committed A80 output.

## Test plan

Run targeted schema tests, then `npm run ci` before each commit.
