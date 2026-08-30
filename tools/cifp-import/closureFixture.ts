/**
 * In-memory normalized source for T04-33 closure tests.
 * Not a real CIFP cycle. FAR* coordinates sit outside the synthetic 20 NM seed.
 */

import { emptyClosureSelected, type ClosureSeed, type ClosureSelected } from "./closure.ts";
import type {
  CifpRecordIdentity,
  NormalizedAirport,
  NormalizedApproach,
  NormalizedCifpSource,
  NormalizedFix,
  NormalizedNavaid,
  NormalizedProcedureLeg,
  NormalizedRunway,
  NormalizedSid,
  NormalizedStar,
  SourceLatLon,
} from "./types.ts";

export const ARP: SourceLatLon = { latDeg: 0, lonDeg: 0 };
export const NEAR: SourceLatLon = { latDeg: 0.05, lonDeg: 0 };
export const FAR: SourceLatLon = { latDeg: 1, lonDeg: 0 };

export function ident(
  section: string,
  airportId: string | undefined,
  recordId: string,
): CifpRecordIdentity {
  return {
    key: `${section}:${airportId ?? "_"}:${recordId}`,
    section,
    ...(airportId !== undefined ? { airportId } : {}),
    recordId,
  };
}

function airport(airportId: string, name = "Field"): NormalizedAirport {
  return {
    identity: ident("PA", airportId, airportId),
    airportId,
    name,
    magVarDeg: 0,
    fieldElevFt: 0,
    arp: ARP,
    lineNo: 1,
  };
}

export function runway(airportId: string, runwayId: string): NormalizedRunway {
  return {
    identity: ident("PG", airportId, runwayId),
    airportId,
    runwayId,
    threshold: ARP,
    bearingDeg: 270,
    lineNo: 2,
  };
}

export function fix(
  id: string,
  position: SourceLatLon,
  airportId: string | undefined = "KAAA",
  kind: NormalizedFix["kind"] = "WAYPOINT",
): NormalizedFix {
  return {
    identity: ident("PC", airportId, id),
    ...(airportId !== undefined ? { airportId } : {}),
    id,
    kind,
    position,
    lineNo: 10,
  };
}

function navaid(
  id: string,
  kind: NormalizedNavaid["kind"],
  position: SourceLatLon,
  extra: Partial<NormalizedNavaid> = {},
): NormalizedNavaid {
  return {
    identity: ident(kind === "NDB" ? "DB" : "D", extra.airportId ?? "KAAA", id),
    airportId: extra.airportId ?? "KAAA",
    id,
    kind,
    position,
    lineNo: 20,
    ...extra,
  };
}

export function tf(
  fixId: string,
  sequence: number,
  extra: Partial<NormalizedProcedureLeg> = {},
): NormalizedProcedureLeg {
  return {
    sequence,
    fixId,
    pathTerminator: "TF",
    supported: true,
    missed: false,
    lineNo: sequence,
    routeType: "2",
    transitionId: "",
    ...extra,
  };
}

function sidOut1(): NormalizedSid {
  return {
    identity: ident("PD", "KAAA", "OUT1"),
    airportId: "KAAA",
    id: "OUT1",
    name: "OUT ONE",
    runwayTransitions: [
      {
        runwayId: "27",
        initialHeadingDeg: 270,
        legs: [tf("FARRW", 10, { routeType: "1", transitionId: "RW27" })],
      },
    ],
    common: [tf("NEARX", 20, { routeType: "2" })],
    enrouteTransitions: [
      {
        id: "FARNT",
        name: "FARNT",
        legs: [tf("FAREN", 30, { routeType: "3", transitionId: "FARNT" })],
      },
    ],
    initialClimbFt: 5000,
  };
}

function starFar1(): NormalizedStar {
  return {
    identity: ident("PE", "KAAA", "FAR1"),
    airportId: "KAAA",
    id: "FAR1",
    name: "FAR ONE",
    transitions: [
      {
        id: "N",
        name: "NORTH",
        legs: [tf("FARST", 10, { routeType: "1", transitionId: "N" }), tf("NEARX", 20)],
      },
    ],
    common: [tf("NEARX", 30)],
  };
}

function approachIls27(): NormalizedApproach {
  return {
    identity: ident("PF", "KAAA", "ILS27"),
    airportId: "KAAA",
    id: "ILS27",
    type: "ILS",
    runway: "27",
    name: "ILS RWY 27",
    locNavaidId: "IAAA",
    gsNavaidId: "IAAAGS",
    fafFixId: "FARAF",
    thresholdFixId: "RW27",
    missedFixId: "FARMS",
    courseDeg: 270,
    gsAngleDeg: 3,
    tchFt: 50,
    missedHeadingDeg: 270,
    missedClimbFt: 3000,
    legs: [tf("FARAF", 10, { routeType: "A" }), tf("RW27", 20)],
  };
}

function otherAirportStar(): NormalizedStar {
  return {
    identity: ident("PE", "KBBB", "BBB1"),
    airportId: "KBBB",
    id: "BBB1",
    name: "BRAVO ONE",
    transitions: [{ id: "N", name: "NORTH", legs: [tf("BBBFX", 10)] }],
    common: [],
  };
}

export function fixtureSource(): NormalizedCifpSource {
  return {
    dialect: "fixed-width",
    airports: [airport("KAAA"), airport("KBBB", "Other Field")],
    runways: [runway("KAAA", "27"), runway("KBBB", "09")],
    navaids: [
      navaid("IAAA", "LOC", NEAR, { courseDeg: 270, locWidthDeg: 5 }),
      navaid("IAAAGS", "GS", NEAR, { gsAngleDeg: 3, tchFt: 50, pairedLocId: "IAAA" }),
      navaid("NEARV", "VORDME", NEAR, { freqMhz: 113 }),
      navaid("BBBV", "VOR", FAR, { airportId: "KBBB", freqMhz: 116 }),
    ],
    fixes: [
      fix("NEARX", NEAR),
      fix("FARRW", FAR),
      fix("FAREN", FAR),
      fix("FARST", FAR),
      fix("FARAF", FAR, "KAAA", "FAF"),
      fix("FARMS", FAR),
      fix("RW27", ARP, "KAAA", "THRESHOLD"),
      fix("BBBFX", FAR, "KBBB"),
      fix("UNREL", FAR, "KBBB"),
    ],
    stars: [starFar1(), otherAirportStar()],
    sids: [sidOut1()],
    approaches: [approachIls27()],
    diagnostics: [],
    skippedByType: {},
  };
}

export function radiusSeed(
  source: NormalizedCifpSource,
  extra?: Partial<ClosureSelected>,
): ClosureSeed {
  return {
    airportId: "KAAA",
    radiusNm: 20,
    selected: {
      ...emptyClosureSelected(),
      airports: source.airports.filter((row) => row.airportId === "KAAA"),
      runways: source.runways.filter((row) => row.airportId === "KAAA"),
      navaids: source.navaids.filter((row) => row.id === "IAAA" || row.id === "NEARV"),
      fixes: source.fixes.filter((row) => row.id === "NEARX" || row.id === "RW27"),
      stars: source.stars.filter((row) => row.id === "FAR1"),
      sids: source.sids.filter((row) => row.id === "OUT1"),
      approaches: source.approaches.filter((row) => row.id === "ILS27"),
      ...extra,
    },
  };
}
