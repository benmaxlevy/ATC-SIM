# T04-55 Random airline-aircraft scenario traffic

**Phase:** 04 Procedures (post-exit addendum)
**Priority:** P0
**Size:** L
**Depends on:** T04-54
**Blocks:** none
**Launch:** Implement this ticket only.

## Goal

Generated scenario traffic deterministically selects a valid airline/aircraft
pair, then allocates that airline's callsign. Authored scenario aircraft stay
unchanged.

## Scope

- Add a compact committed roster of airline ICAO code, display name, and exact
  aircraft ICAO types. No URLs, source metadata, runtime data fetch, or engine
  variants.
- Add a pure seeded selector for eligible `(airline, aircraftType)` pairs and
  callsign allocation for its selected airline. Empty/invalid roster fails
  explicitly; never independently sample airline and type.
- Replace random/default generated traffic in departure schedules, arrival
  scheduler, STAR inbound generated spawns, and `?traffic=` arc spawns.
- Keep authored scenario JSON poses/types/callsigns and parser/pilot behavior
  unchanged. Types without OpenAP data remain legal and use their existing
  DEFAULT_PROFILE runtime fallback.

## Acceptance criteria

- [ ] Same seed produces identical generated airline/type/callsign schedules.
- [ ] Every generated callsign ICAO has a roster row containing its exact type.
- [ ] Different seeds vary valid pairs; collisions and numeric-tail uniqueness persist.
- [ ] Generated departures, scheduled arrivals, STAR inbound traffic, and arc traffic use valid pairs; authored scenario rows remain unchanged.
- [ ] Generic tests use synthetic roster matrices; one production-data test checks row/schema validity only, never fleet counts.
- [ ] No network/source/provenance system, airport branch, parser change, or runtime profile mutation.

## Suggested files

- `src/scenario/trafficAirlines.ts`
- `src/scenario/callsigns.ts`
- `src/scenario/{departureGenerator,arrivalScheduler,spawn}.ts`
- `src/scenario/test/`
