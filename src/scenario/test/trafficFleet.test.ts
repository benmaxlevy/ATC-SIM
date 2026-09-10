import { expect, test } from "vitest";
import { TRAFFIC_AIRLINES, allocateTrafficPair, allocateTrafficPairForType } from "../callsigns";

test("generated traffic always pairs a callsign airline with an operated type", () => {
  const rng = (() => {
    let state = 1;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
  })();
  const used = new Set<string>();
  for (let i = 0; i < 100; i += 1) {
    const pair = allocateTrafficPair(rng, used);
    expect(pair.callsign.startsWith(pair.airline.icao)).toBe(true);
    expect(pair.airline.aircraftTypes).toContain(pair.aircraftType);
  }
});

test("traffic pairing is deterministic and authored types keep a valid airline", () => {
  const make = () => {
    const used = new Set<string>();
    let state = 42;
    const rng = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
    return Array.from({ length: 10 }, () => allocateTrafficPair(rng, used));
  };
  expect(make()).toEqual(make());

  const used = new Set<string>();
  const pair = allocateTrafficPairForType(() => 0, used, "B738");
  expect(pair.airline.aircraftTypes).toContain("B738");
  expect(pair.callsign.startsWith(pair.airline.icao)).toBe(true);
  expect(TRAFFIC_AIRLINES.length).toBeGreaterThan(0);
});

test("GTI operates its freighter fleet", () => {
  const gti = TRAFFIC_AIRLINES.find((airline) => airline.icao === "GTI");
  expect(gti?.aircraftTypes).toEqual(["B744", "B748", "B77F", "B763"]);
});
