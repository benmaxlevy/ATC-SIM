# T04-42 A80 videomap integration and acceptance

**Goal:** Prove complete A80 videomap import, map-group behavior, reachability,
rendering, and documentation end to end.

## Acceptance criteria

- [ ] KATL scenario loads complete approved A80 inventory through generic loaders.
- [ ] Selected group maps appear in correct MAIN/submenu order with original CRC IDs.
- [ ] GEO MAPS exposes every imported map, including GEO-only maps.
- [ ] High and sparse CRC IDs toggle without identity remapping.
- [ ] ARP alignment is verified for runway, finals, MVA, arrival, departure, and satellite geometry.
- [ ] A/B brightness, CURRENT, CLR ALL, and `*D ALL/NONE` remain synchronized.
- [ ] Automated tests and repository CI pass.
- [ ] Documentation records local source paths, permission boundary, reproducible command, and manual leftovers.
- [ ] No runtime vNAS fetch, chart scrape, proprietary font, or phase 5 work is introduced.

## Test plan

Run the phase acceptance suite, `npm test`, and `npm run ci`. Record Chrome
visual checks honestly; missing visual operation is a manual leftover, not a
fabricated pass.
