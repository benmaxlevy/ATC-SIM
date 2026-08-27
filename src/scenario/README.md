# Scenario assets

Playable sessions are registered in `playable-scenarios.json`. Each entry names
its stable id, airport ICAO, display label, default marker, and scenario source.
The inventory validates every source before exposing it to boot or a future
picker.

Add an airport by registering its scenario asset and facility catalog/MAPS/MVA
assets. Do not add ICAO, scenario-id, or named-loader conditionals to boot or
picker code.
