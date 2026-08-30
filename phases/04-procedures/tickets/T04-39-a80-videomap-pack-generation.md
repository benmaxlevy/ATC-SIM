# T04-39 A80 videomap pack generation

**Goal:** Generate and commit the complete permitted A80 STARS KATL video-map
pack using the generic source and conversion tools.

## Source

Use local CRC `C:\Users\Ben\AppData\Local\CRC\ARTCCs\ZTL.json` and matching
files under `C:\Users\Ben\AppData\Local\CRC\VideoMaps\ZTL\`. Select the
Atlanta TRACON inventory tagged `A80` and `STARS`, according to the approved
tool policy. Scenario ARP is the projection origin.

## Acceptance criteria

- [ ] All approved A80 STARS inventory maps are converted; no DCB-only filtering.
- [ ] Maps absent from DCB groups remain in generated inventory.
- [ ] Generated files load through existing generic video-map loader.
- [ ] CRC identity, source filename, title, brightness, and conversion provenance are recorded.
- [ ] Output is deterministic and reviewable; local CRC source is not committed.
- [ ] Permission/attribution note accompanies committed generated data.
- [ ] Manifest reports source count, output count, skipped geometry, and failures.
- [ ] No map identity is renumbered.

## Out of scope

Runtime CRC access, chart scraping, proprietary assets, and performance redesign.

## Test plan

Run pack validation, targeted loader tests, and `npm run ci` before each commit.
