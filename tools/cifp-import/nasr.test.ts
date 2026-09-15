import { expect, test } from "vitest";
import { enrichAirportsWithNasr, mergeNasrData, parseNasrApt, parseNasrTwr } from "./nasr.ts";
import type { NormalizedAirport } from "./types.ts";

function fakeAirport(id: string, name = "Test Field"): NormalizedAirport {
  return {
    identity: { key: `PA:${id}:${id}`, section: "PA", airportId: id, recordId: id },
    airportId: id,
    name,
    magVarDeg: 0,
    fieldElevFt: 1000,
    arp: { latDeg: 33.5, lonDeg: -84.5 },
    lineNo: 1,
  };
}

test("enriches matching airport with public-use and towered status (AC3)", () => {
  const aptCsv = [
    "ARPT_ID,ICAO_ID,FAC_USE,ARPT_NAME",
    "ATL,KATL,PU,HARTSFIELD - JACKSON ATLANTA INTL",
    "FTY,KFTY,PU,FULTON COUNTY AIRPORT",
    "52A,,PR,MADISON PRIVATE",
  ].join("\n");

  const twrCsv = ["ARPT_ID,ICAO_ID,TOWER_FLAG", "ATL,KATL,Y", "FTY,KFTY,Y"].join("\n");

  const apt = parseNasrApt(aptCsv, "APT.csv");
  const twr = parseNasrTwr(twrCsv, "TWR.csv");
  const merged = mergeNasrData([apt, twr]);

  const airports = [fakeAirport("KATL"), fakeAirport("KFTY"), fakeAirport("K52A")];
  const { enriched, diagnostics } = enrichAirportsWithNasr(airports, merged);

  const katl = enriched.find((a) => a.airportId === "KATL");
  expect(katl?.publicUse).toBe(true);
  expect(katl?.towered).toBe(true);
  expect(katl?.serviceMetadata?.sourceFile).toBe("APT.csv");

  const k52a = enriched.find((a) => a.airportId === "K52A");
  expect(k52a?.publicUse).toBe(false);
  expect(k52a?.towered).toBeUndefined();

  // No conflict diagnostics
  expect(diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
});

test("missing NASR companion leaves public-use and towered unknown (undefined), never false (AC3)", () => {
  const aptCsv = ["ARPT_ID,ICAO_ID,FAC_USE", "ATL,KATL,PU"].join("\n");

  const apt = parseNasrApt(aptCsv, "APT.csv");
  const airports = [fakeAirport("KATL"), fakeAirport("KXYZ")];
  const { enriched } = enrichAirportsWithNasr(airports, apt);

  const kxyz = enriched.find((a) => a.airportId === "KXYZ");
  expect(kxyz).toBeDefined();
  expect(kxyz?.publicUse).toBeUndefined();
  expect(kxyz?.towered).toBeUndefined();
  expect(kxyz?.serviceMetadata).toBeUndefined();
});

test("duplicate NASR rows with identical payload emit duplicate warning and keep one row (AC3)", () => {
  const aptCsv = ["ARPT_ID,ICAO_ID,FAC_USE", "ATL,KATL,PU", "ATL,KATL,PU"].join("\n");

  const apt = parseNasrApt(aptCsv, "APT.csv");
  expect(apt.diagnostics.some((d) => d.code === "DUPLICATE_NASR_RECORD")).toBe(true);
  expect(apt.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

  const record = apt.airports.get("KATL");
  expect(record?.publicUse).toBe(true);
});

test("conflicting NASR rows emit error diagnostic naming both records (AC3)", () => {
  const aptCsv = [
    "ARPT_ID,ICAO_ID,FAC_USE",
    "ATL,KATL,PU",
    "ATL,KATL,PR", // Conflict!
  ].join("\n");

  const apt = parseNasrApt(aptCsv, "APT.csv");
  const errors = apt.diagnostics.filter((d) => d.code === "CONFLICTING_NASR_RECORD");
  expect(errors).toHaveLength(1);
  expect(errors[0]?.message).toContain("Conflicting publicUse");
  expect(errors[0]?.message).toContain("APT.csv:2");
  expect(errors[0]?.message).toContain("APT.csv:3");
});

test("unmatched NASR rows emit diagnostic", () => {
  const aptCsv = [
    "ARPT_ID,ICAO_ID,FAC_USE",
    "ATL,KATL,PU",
    "ZZZ,KZZZ,PU", // Not in CIFP
  ].join("\n");

  const apt = parseNasrApt(aptCsv, "APT.csv");
  const airports = [fakeAirport("KATL")];
  const { diagnostics } = enrichAirportsWithNasr(airports, apt);

  const unmatched = diagnostics.filter((d) => d.code === "UNMATCHED_NASR_RECORD");
  expect(unmatched).toHaveLength(1);
  expect(unmatched[0]?.airportId).toBe("KZZZ");
});

test("parses pipe-delimited and JSON format NASR files", () => {
  const pipeApt = ["APT|04508.*A|AIRPORT|ATL|KATL|GA|PU|HARTSFIELD"].join("\n");
  const apt = parseNasrApt(pipeApt, "APT.txt");
  expect(apt.airports.get("KATL")?.publicUse).toBe(true);

  const jsonTwr = JSON.stringify([
    { airportId: "KATL", towered: true },
    { airportId: "KPDK", towered: true },
  ]);
  const twr = parseNasrTwr(jsonTwr, "TWR.json");
  expect(twr.airports.get("KATL")?.towered).toBe(true);
  expect(twr.airports.get("KPDK")?.towered).toBe(true);
});
