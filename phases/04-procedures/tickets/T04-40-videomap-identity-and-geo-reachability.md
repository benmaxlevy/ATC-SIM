# T04-40 Videomap identity and GEO reachability

**Goal:** Make every imported map reachable through GEO MAPS, CURRENT, internal
ID lookup, or original CRC map ID while DCB buttons follow map-group layout.

## Acceptance criteria

- [ ] Runtime distinguishes stable internal ID, CRC `starsId`, and optional DCB group slot.
- [ ] GEO MAPS lists complete loaded inventory, including maps absent from DCB groups.
- [ ] CURRENT lists active maps and toggles them consistently.
- [ ] Map commands resolve every imported map by internal ID and `starsId`.
- [ ] DCB buttons use group order and display CRC map ID plus short name.
- [ ] Empty group cells remain disabled; no dense identity renumbering.
- [ ] Existing KDEM/KATL behavior and scope-command isolation remain green.

## Out of scope

New map geometry, CRC network access, map-group editor, and weather maps.

## Test plan

Run map command/list integration tests and `npm run ci` before each commit.
