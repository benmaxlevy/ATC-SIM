# T04-38 CRC map groups and DCB layout

**Goal:** Preserve CRC position-specific map groups as data while keeping the
complete facility inventory independent from DCB layout.

## Source

Read Atlanta TRACON `starsConfiguration.mapGroups` and
`videoMapIds` from local `C:\Users\Ben\AppData\Local\CRC\ARTCCs\ZTL.json`.
Resolve group map references through `videoMaps[].starsId`.

## Acceptance criteria

- [ ] Extract group order, TCP assignments, map IDs, MAIN order, submenu order, duplicates, and empty slots.
- [ ] Preserve CRC `starsId`; group position is layout metadata only.
- [ ] Model six MAIN maps and up to 32 submenu maps without assuming all IDs are dense.
- [ ] Detect missing or ambiguous group references with actionable diagnostics.
- [ ] Keep maps present in facility inventory even when absent from every DCB group.
- [ ] Tests prove A80 group extraction and sparse/duplicate/empty source behavior.

## Out of scope

Runtime DCB wiring, geometry conversion, and full generated KATL output.

## Test plan

Run targeted group tests and `npm run ci` before each commit.
