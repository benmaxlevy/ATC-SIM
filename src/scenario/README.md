# Scenario assets

Playable sessions are registered in `playable-scenarios.json`. Each entry names
its stable id, airport ICAO, display label, default marker, and scenario source.
The inventory validates every source before exposing it to boot or a future
picker.

Add an airport by registering its scenario asset and facility catalog/MAPS/MVA
assets. Do not add ICAO, scenario-id, or named-loader conditionals to boot or
picker code.

## Folder layout

```text
src/scenario/
  *.json                  Scenario assets consumed by inventory or compatibility loaders
  playable-scenarios.json Scenario manifest; controls playable/session-visible entries
  data/<icao>/            Facility catalog JSON: navaids, fixes, SIDs, STARs, approaches
  data/*-mva.json         Optional authored MVA chart for one facility
  procedures/             Runtime catalog types, loader, and SID helpers
  video-maps/<ICAO>/      Runtime video-map catalog and geometry
  briefs/                 Human-facing controller/training documentation
  *.ts                    Runtime scenario loading, spawning, scheduling, and validation
  *.test.ts               Colocated automated coverage and intentional fixtures
```

`procedures/` is not a data dump or dead folder. `load.ts` loads it for every
scenario, FMS/spawn code uses its helpers, and the CIFP pack tool emits its
catalog schema. Procedure JSON lives under `data/<icao>/`; the directory name
is runtime code.

Loose scenario JSON is intentional. KDEM has visible configurations plus
hidden ILS/ATPA test benches. KATL scenarios currently load the committed
catalog for validation but stay out of playable inventory until KATL maps are
authored. Do not delete or move these files without updating their manifest,
loader, tests, and compatibility exports.
