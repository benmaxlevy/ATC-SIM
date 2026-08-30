/**
 * Synthetic ARINC 424 record builders for T04-31 fixtures and tests.
 * Not a real FAA cycle. Packed lat/lon matches testdata/cifp/frozen-subset.cifp.
 */

import { arincRecord } from "./arincLayout.ts";

export function pa(opts: {
  icao: string;
  name: string;
  lat: string;
  lon: string;
  magVar?: string;
  elev?: string;
}): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "P"],
    [7, 4, opts.icao],
    [11, 2, "K "],
    [13, 1, "A"],
    [22, 1, "0"],
    [33, 9, opts.lat],
    [42, 10, opts.lon],
    [52, 5, opts.magVar ?? "E0000"],
    [57, 5, opts.elev ?? "00000"],
    [94, 30, opts.name],
  ]);
}

export function pg(opts: {
  icao: string;
  rwy: string;
  lat: string;
  lon: string;
  bearing?: string;
  length?: string;
}): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "P"],
    [7, 4, opts.icao],
    [11, 2, "K "],
    [13, 1, "G"],
    [14, 5, opts.rwy],
    [22, 1, "0"],
    [23, 5, opts.length ?? "10000"],
    [28, 4, opts.bearing ?? "2700"],
    [33, 9, opts.lat],
    [42, 10, opts.lon],
  ]);
}

export function vhf(opts: {
  id: string;
  name: string;
  lat: string;
  lon: string;
  freq?: string;
  classRaw?: string;
  airport?: string;
}): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "D"],
    [7, 4, opts.airport ?? ""],
    [14, 4, opts.id],
    [20, 2, "K "],
    [22, 1, "0"],
    [23, 5, opts.freq ?? "11300"],
    [28, 5, opts.classRaw ?? "VDT  "],
    [33, 9, opts.lat],
    [42, 10, opts.lon],
    [85, 1, "1"],
    [94, 30, opts.name],
  ]);
}

/**
 * FAA CIFP DME-only / TACAN / ILS-DME VHF row: VOR lat/lon (33/42) blank,
 * DME ident at 52 and DME lat/lon at 56/65. Matches the real cycle D shape
 * that previously threw `missing coordinate`.
 */
export function vhfDmeOnly(opts: {
  id: string;
  name: string;
  lat: string;
  lon: string;
  freq?: string;
  classRaw?: string;
  airport?: string;
  dmeIdent?: string;
}): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "D"],
    [7, 4, opts.airport ?? ""],
    [14, 4, opts.id],
    [20, 2, "K7"],
    [22, 1, "0"],
    [23, 5, opts.freq ?? "11400"],
    [28, 5, opts.classRaw ?? " DUW "],
    [52, 4, opts.dmeIdent ?? opts.id],
    [56, 9, opts.lat],
    [65, 10, opts.lon],
    [94, 30, opts.name],
  ]);
}

/** FAA terminal NDB: subsection N at column 6 (PN), not column 13. */
export function pn(opts: {
  icao: string;
  id: string;
  name: string;
  lat: string;
  lon: string;
  freq?: string;
}): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "P"],
    [6, 1, "N"],
    [7, 4, opts.icao],
    [11, 2, "K7"],
    [14, 4, opts.id],
    [20, 2, "K7"],
    [22, 1, "0"],
    [23, 5, opts.freq ?? "02410"],
    [33, 9, opts.lat],
    [42, 10, opts.lon],
    [94, 30, opts.name],
  ]);
}

export function ndb(opts: {
  id: string;
  name: string;
  lat: string;
  lon: string;
  freq?: string;
  airport?: string;
}): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "D"],
    [6, 1, "B"],
    [7, 4, opts.airport ?? ""],
    [14, 4, opts.id],
    [20, 2, "K "],
    [22, 1, "0"],
    [23, 5, opts.freq ?? "03850"],
    [33, 9, opts.lat],
    [42, 10, opts.lon],
    [94, 30, opts.name],
  ]);
}

export function pc(opts: {
  icao: string;
  id: string;
  lat: string;
  lon: string;
  type?: string;
}): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "P"],
    [7, 4, opts.icao],
    [11, 2, "K "],
    [13, 1, "C"],
    [14, 5, opts.id],
    [20, 2, "K "],
    [22, 1, "0"],
    [27, 3, opts.type ?? "  I"],
    [33, 9, opts.lat],
    [42, 10, opts.lon],
  ]);
}

export function pi(opts: {
  icao: string;
  locId: string;
  lat: string;
  lon: string;
  freq?: string;
  course?: string;
  gsLat?: string;
  gsLon?: string;
  width?: string;
  gsAngle?: string;
  tch?: string;
  rwy?: string;
}): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "P"],
    [7, 4, opts.icao],
    [11, 2, "K "],
    [13, 1, "I"],
    [14, 4, opts.locId],
    [18, 1, "1"],
    [22, 1, "0"],
    [23, 5, opts.freq ?? "11030"],
    [28, 5, opts.rwy ?? "RW27"],
    [33, 9, opts.lat],
    [42, 10, opts.lon],
    [52, 4, opts.course ?? "2700"],
    [56, 9, opts.gsLat ?? ""],
    [65, 10, opts.gsLon ?? ""],
    [84, 4, opts.width ?? "0500"],
    [88, 3, opts.gsAngle ?? "300"],
    [96, 2, opts.tch ?? "50"],
  ]);
}

export function pm(opts: {
  icao: string;
  locId: string;
  markerType: string;
  rwy: string;
  lat: string;
  lon: string;
}): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "P"],
    [7, 4, opts.icao],
    [11, 2, "K "],
    [13, 1, "M"],
    [14, 4, opts.locId],
    [18, 3, opts.markerType],
    [22, 1, "0"],
    [28, 5, opts.rwy],
    [33, 9, opts.lat],
    [42, 10, opts.lon],
  ]);
}

export function pe(opts: {
  icao: string;
  starId: string;
  routeType: string;
  trans?: string;
  seq: string;
  fixId: string;
  path: string;
  altDesc?: string;
  alt?: string;
  spd?: string;
  spdDesc?: string;
  desc?: string;
}): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "P"],
    [7, 4, opts.icao],
    [11, 2, "K "],
    [13, 1, "E"],
    [14, 6, opts.starId],
    [20, 1, opts.routeType],
    [21, 5, opts.trans ?? ""],
    [27, 3, opts.seq],
    [30, 5, opts.fixId],
    [35, 2, "K "],
    [37, 1, "P"],
    [38, 1, "C"],
    [39, 1, "0"],
    [40, 4, opts.desc ?? "E   "],
    [48, 2, opts.path],
    [83, 1, opts.altDesc ?? ""],
    [85, 5, opts.alt ?? ""],
    [100, 3, opts.spd ?? ""],
    [118, 1, opts.spdDesc ?? ""],
  ]);
}

export function pf(opts: {
  icao: string;
  appId: string;
  routeType: string;
  trans?: string;
  seq: string;
  fixId?: string;
  path: string;
  recNav?: string;
  course?: string;
  altDesc?: string;
  alt?: string;
  desc?: string;
}): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "P"],
    [7, 4, opts.icao],
    [11, 2, "K "],
    [13, 1, "F"],
    [14, 6, opts.appId],
    [20, 1, opts.routeType],
    [21, 5, opts.trans ?? ""],
    [27, 3, opts.seq],
    [30, 5, opts.fixId ?? ""],
    [35, 2, "K "],
    [37, 1, "P"],
    [38, 1, "C"],
    [39, 1, "0"],
    [40, 4, opts.desc ?? "E   "],
    [48, 2, opts.path],
    [51, 4, opts.recNav ?? ""],
    [71, 4, opts.course ?? ""],
    [83, 1, opts.altDesc ?? ""],
    [85, 5, opts.alt ?? ""],
  ]);
}

export function pd(opts: {
  icao: string;
  sidId: string;
  routeType: string;
  trans?: string;
  seq: string;
  fixId?: string;
  path: string;
  altDesc?: string;
  alt?: string;
  spd?: string;
  spdDesc?: string;
  desc?: string;
  course?: string;
  transAlt?: string;
}): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "P"],
    [7, 4, opts.icao],
    [11, 2, "K "],
    [13, 1, "D"],
    [14, 6, opts.sidId],
    [20, 1, opts.routeType],
    [21, 5, opts.trans ?? ""],
    [27, 3, opts.seq],
    [30, 5, opts.fixId ?? ""],
    [35, 2, "K "],
    [37, 1, "P"],
    [38, 1, "C"],
    [39, 1, "0"],
    [40, 4, opts.desc ?? "E   "],
    [48, 2, opts.path],
    [71, 4, opts.course ?? ""],
    [83, 1, opts.altDesc ?? ""],
    [85, 5, opts.alt ?? ""],
    [95, 5, opts.transAlt ?? ""],
    [100, 3, opts.spd ?? ""],
    [118, 1, opts.spdDesc ?? ""],
  ]);
}

export function pdSid(icao: string, sidId: string): string {
  return pd({ icao, sidId, routeType: "2", seq: "010", path: "IF" });
}

export function erAirway(): string {
  return arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "E"],
    [6, 1, "R"],
    [14, 5, "V1"],
    [22, 1, "0"],
  ]);
}

/**
 * Same KDEM-like geometry as `buildFixedWidthSubset`, any ICAO. Not a real
 * cycle. Used by T04-34 pack tests for a synthetic second airport / KATL-shaped
 * fixture without an ICAO parse branch.
 */
export function buildIcaoFixedWidthSubset(icao: string): string {
  return buildFixedWidthSubset().replaceAll("KSYN", icao);
}

/** Happy-path KDEM-like geometry near 0°N 0°E. */
export function buildFixedWidthSubset(): string {
  return [
    "# Synthetic FAA CIFP-shaped ARINC 424-18 records (T04-31). NOT a real cycle.",
    "# 132-character fixed-width. Packed lat/lon. KDEM-like near 0N 0E.",
    pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
    vhf({
      id: "DEM",
      name: "DEMO",
      lat: "N00004800",
      lon: "E000002400",
      freq: "11300",
      classRaw: "VDT  ",
    }),
    ndb({ id: "DMO", name: "DEMO", lat: "N00000900", lon: "E000060000", freq: "03850" }),
    pc({ icao: "KSYN", id: "NEMAX", lat: "N00120000", lon: "E000170000", type: "  I" }),
    pc({ icao: "KSYN", id: "NELBO", lat: "N00070000", lon: "E000160000", type: "  I" }),
    pc({ icao: "KSYN", id: "MERGE", lat: "N00000000", lon: "E000100000", type: "  I" }),
    pc({ icao: "KSYN", id: "FI27", lat: "N00000000", lon: "E000060000", type: "  F" }),
    pc({ icao: "KSYN", id: "RW27", lat: "N00000000", lon: "E000000000", type: "  G" }),
    pc({ icao: "KSYN", id: "MISSD", lat: "N00060000", lon: "W000080000", type: "  M" }),
    pc({ icao: "KSYN", id: "SIDEP", lat: "N00010000", lon: "E000040000", type: "  I" }),
    pg({ icao: "KSYN", rwy: "RW27", lat: "N00000000", lon: "E000000000", bearing: "2700" }),
    pi({
      icao: "KSYN",
      locId: "IDEM",
      lat: "N00000000",
      lon: "W000015100",
      gsLat: "S00000420",
      gsLon: "E000001080",
    }),
    pm({
      icao: "KSYN",
      locId: "IDEM",
      markerType: "OM",
      rwy: "RW27",
      lat: "N00000000",
      lon: "E000062000",
    }),
    pe({
      icao: "KSYN",
      starId: "DEM1",
      routeType: "1",
      trans: "N",
      seq: "010",
      fixId: "NEMAX",
      path: "IF",
      altDesc: "+",
      alt: "10000",
      spd: "250",
      spdDesc: "-",
    }),
    pe({
      icao: "KSYN",
      starId: "DEM1",
      routeType: "1",
      trans: "N",
      seq: "020",
      fixId: "NELBO",
      path: "TF",
      altDesc: "+",
      alt: "08000",
      spd: "230",
      spdDesc: "-",
    }),
    pe({
      icao: "KSYN",
      starId: "DEM1",
      routeType: "2",
      seq: "010",
      fixId: "MERGE",
      path: "TF",
      altDesc: " ",
      alt: "04000",
      spd: "210",
      spdDesc: "-",
    }),
    pf({
      icao: "KSYN",
      appId: "ILS27",
      routeType: "I",
      trans: "RW27",
      seq: "010",
      fixId: "FI27",
      path: "IF",
      recNav: "IDEM",
      course: "2700",
      altDesc: " ",
      alt: "02000",
      desc: "E  F",
    }),
    pf({
      icao: "KSYN",
      appId: "ILS27",
      routeType: "I",
      trans: "RW27",
      seq: "020",
      fixId: "RW27",
      path: "CF",
      recNav: "IDEM",
      course: "2700",
    }),
    pf({
      icao: "KSYN",
      appId: "ILS27",
      routeType: "Z",
      seq: "010",
      path: "VA",
      course: "2700",
      altDesc: "+",
      alt: "03000",
      desc: "E  M",
    }),
    pf({
      icao: "KSYN",
      appId: "ILS27",
      routeType: "Z",
      seq: "020",
      fixId: "MISSD",
      path: "DF",
      desc: "E  M",
    }),
    pd({
      icao: "KSYN",
      sidId: "DEP1",
      routeType: "1",
      trans: "RW27",
      seq: "010",
      fixId: "SIDEP",
      path: "IF",
      altDesc: "+",
      alt: "01500",
      course: "2700",
      transAlt: "05000",
    }),
    pd({
      icao: "KSYN",
      sidId: "DEP1",
      routeType: "2",
      seq: "010",
      fixId: "MERGE",
      path: "TF",
      altDesc: " ",
      alt: "05000",
      spd: "250",
      spdDesc: "-",
    }),
    pd({
      icao: "KSYN",
      sidId: "DEP1",
      routeType: "3",
      trans: "NORMA",
      seq: "010",
      fixId: "NEMAX",
      path: "TF",
      altDesc: "+",
      alt: "06000",
    }),
    erAirway(),
    "this is garbage not a record",
    "",
  ].join("\n");
}

/**
 * Synthetic records packed like a real FAA CIFP cycle (HDR prefix, DME-only
 * D row, PN at col 6, hyphenated approach id, procedure continuation).
 * Geometry is KDEM-like near 0°N 0°E. Not a real cycle extract.
 */
export function buildFaaLayoutSubset(): string {
  const ilsDme = vhfDmeOnly({
    id: "IDEM",
    name: "ILS DME",
    lat: "S00000420",
    lon: "E000001080",
    freq: "11030",
    classRaw: " ITW ",
    airport: "KSYN",
  });
  const dmeOnly = vhfDmeOnly({
    id: "SDM",
    name: "SYN DME",
    lat: "N00004800",
    lon: "E000002400",
    classRaw: " DUW ",
  });
  const terminalNdb = pn({
    icao: "KSYN",
    id: "SYN",
    name: "SYN NDB",
    lat: "N00000900",
    lon: "E000050000",
  });
  const hyphenApp = pf({
    icao: "KSYN",
    appId: "R10-Y",
    routeType: "A",
    trans: "FI27",
    seq: "010",
    fixId: "FI27",
    path: "IF",
    recNav: "IDEM",
    course: "2700",
    altDesc: " ",
    alt: "02000",
  });
  const hyphenFinal = pf({
    icao: "KSYN",
    appId: "R10-Y",
    routeType: "R",
    trans: "RW27",
    seq: "010",
    fixId: "FI27",
    path: "IF",
    recNav: "IDEM",
    course: "2700",
  });
  const hyphenMap = pf({
    icao: "KSYN",
    appId: "R10-Y",
    routeType: "R",
    trans: "RW27",
    seq: "020",
    fixId: "RW27",
    path: "CF",
    recNav: "IDEM",
    course: "2700",
  });
  const continuation = arincRecord([
    [1, 1, "S"],
    [2, 3, "USA"],
    [5, 1, "P"],
    [7, 4, "KSYN"],
    [11, 2, "K7"],
    [13, 1, "F"],
    [14, 6, "R10-Y"],
    [20, 1, "R"],
    [21, 5, "RW27"],
    [27, 3, "020"],
    [30, 5, "RW27"],
    [39, 1, "2"],
    [48, 2, "CF"],
  ]);
  return [
    "HDR01FAACIFP18      001P000000000000000001JAN00000:00:00  U.S.A. DOT FAA SYNTHETIC",
    "# Synthetic FAA-column ARINC 424-18. NOT a real cycle.",
    buildFixedWidthSubset().replace(/^#[^\n]*\n/gm, ""),
    dmeOnly,
    ilsDme,
    terminalNdb,
    hyphenApp,
    hyphenFinal,
    hyphenMap,
    continuation,
    "",
  ].join("\n");
}

export function buildUnsupportedLegsSubset(): string {
  return [
    "# Unsupported RF/hold/arc/PT legs must be counted, never emitted as TF.",
    pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
    pc({ icao: "KSYN", id: "NEMAX", lat: "N00120000", lon: "E000170000" }),
    pc({ icao: "KSYN", id: "NELBO", lat: "N00070000", lon: "E000160000" }),
    pc({ icao: "KSYN", id: "MERGE", lat: "N00000000", lon: "E000100000" }),
    pe({
      icao: "KSYN",
      starId: "DEM1",
      routeType: "2",
      seq: "010",
      fixId: "NEMAX",
      path: "IF",
      altDesc: "+",
      alt: "10000",
    }),
    pe({
      icao: "KSYN",
      starId: "DEM1",
      routeType: "2",
      seq: "020",
      fixId: "NELBO",
      path: "RF",
    }),
    pe({
      icao: "KSYN",
      starId: "DEM1",
      routeType: "2",
      seq: "030",
      fixId: "MERGE",
      path: "HA",
    }),
    pe({
      icao: "KSYN",
      starId: "DEM1",
      routeType: "2",
      seq: "040",
      fixId: "MERGE",
      path: "AF",
    }),
    pe({
      icao: "KSYN",
      starId: "DEM1",
      routeType: "2",
      seq: "050",
      fixId: "MERGE",
      path: "PI",
    }),
    pe({
      icao: "KSYN",
      starId: "DEM1",
      routeType: "2",
      seq: "060",
      fixId: "MERGE",
      path: "TF",
      altDesc: " ",
      alt: "04000",
    }),
    "",
  ].join("\n");
}

export function buildDanglingFixSubset(): string {
  return [
    "# STAR references MERGE which is absent.",
    pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
    pc({ icao: "KSYN", id: "NEMAX", lat: "N00120000", lon: "E000170000" }),
    pc({ icao: "KSYN", id: "NELBO", lat: "N00070000", lon: "E000160000" }),
    pe({
      icao: "KSYN",
      starId: "DEM1",
      routeType: "1",
      trans: "N",
      seq: "010",
      fixId: "NEMAX",
      path: "TF",
    }),
    pe({
      icao: "KSYN",
      starId: "DEM1",
      routeType: "2",
      seq: "010",
      fixId: "MERGE",
      path: "TF",
    }),
    "",
  ].join("\n");
}

export function buildUnsupportedSidSubset(): string {
  return [
    "# SID RF must be counted, never emitted as a TF catalog leg.",
    pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
    pc({ icao: "KSYN", id: "SIDEP", lat: "N00010000", lon: "E000040000" }),
    pc({ icao: "KSYN", id: "MERGE", lat: "N00000000", lon: "E000100000" }),
    pd({
      icao: "KSYN",
      sidId: "DEP1",
      routeType: "2",
      seq: "010",
      fixId: "SIDEP",
      path: "IF",
      altDesc: "+",
      alt: "01500",
    }),
    pd({
      icao: "KSYN",
      sidId: "DEP1",
      routeType: "2",
      seq: "020",
      fixId: "MERGE",
      path: "RF",
    }),
    pd({
      icao: "KSYN",
      sidId: "DEP1",
      routeType: "2",
      seq: "030",
      fixId: "MERGE",
      path: "TF",
      altDesc: " ",
      alt: "05000",
    }),
    "",
  ].join("\n");
}

export function buildDanglingSidSubset(): string {
  return [
    "# SID references GHOST which is absent.",
    pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
    pc({ icao: "KSYN", id: "SIDEP", lat: "N00010000", lon: "E000040000" }),
    pd({
      icao: "KSYN",
      sidId: "DEP1",
      routeType: "1",
      trans: "RW27",
      seq: "010",
      fixId: "SIDEP",
      path: "IF",
      altDesc: "+",
      alt: "01500",
    }),
    pd({
      icao: "KSYN",
      sidId: "DEP1",
      routeType: "2",
      seq: "010",
      fixId: "GHOST",
      path: "TF",
      altDesc: " ",
      alt: "05000",
    }),
    "",
  ].join("\n");
}

export function buildMalformedCoordSubset(): string {
  return [
    pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
    pc({ icao: "KSYN", id: "NEMAX", lat: "XXBADLAT", lon: "E000170000" }),
    "",
  ].join("\n");
}

export function buildConflictSubset(): string {
  return [
    pa({ icao: "KSYN", name: "Synthetic Field", lat: "N00000000", lon: "E000000000" }),
    vhf({ id: "DEM", name: "DEMO", lat: "N00004800", lon: "E000002400" }),
    vhf({ id: "DEM", name: "DEMO", lat: "N00120000", lon: "E000170000" }),
    "",
  ].join("\n");
}

/**
 * Synthetic parallel-runway field. PG has L/R (and one water `W`) only.
 * SID/STAR transitions use FAA `B` (“both”) grouping: `RW26B` → 26L+26R,
 * not 26W. Exact `RW10` / `10` stay ungrouped. Not a real cycle.
 */
export function buildGroupedRunwaySubset(): string {
  const icao = "KGRP";
  const rwy = (id: string, lat: string, lon: string, bearing: string): string =>
    pg({ icao, rwy: id, lat, lon, bearing });
  const sidLeg = (
    trans: string,
    seq: string,
    path: string,
    extra: { fixId?: string; course?: string; altDesc?: string; alt?: string } = {},
  ): string =>
    pd({
      icao,
      sidId: "GRP1",
      routeType: "4",
      trans,
      seq,
      path,
      ...extra,
    });
  return [
    "# Synthetic grouped-runway CIFP. NOT a real cycle. FAA B = both L/R.",
    pa({ icao, name: "Group Field", lat: "N00000000", lon: "E000000000" }),
    rwy("RW08L", "N00000100", "W000002000", "0800"),
    rwy("RW08R", "S00000100", "W000002000", "0800"),
    rwy("RW08W", "N00000300", "W000002000", "0800"),
    rwy("RW09L", "N00000100", "W000001000", "0900"),
    rwy("RW09R", "S00000100", "W000001000", "0900"),
    rwy("RW10", "N00000000", "E000000000", "1000"),
    rwy("RW26L", "S00000100", "E000002000", "2600"),
    rwy("RW26R", "N00000100", "E000002000", "2600"),
    rwy("RW27L", "S00000100", "E000001000", "2700"),
    rwy("RW27R", "N00000100", "E000001000", "2700"),
    pc({ icao, id: "JOIN", lat: "N00010000", lon: "E000040000" }),
    pc({ icao, id: "GATE", lat: "N00020000", lon: "E000050000" }),
    pc({ icao, id: "FI26L", lat: "N00000050", lon: "E000030000", type: "  F" }),
    sidLeg("RW26B", "010", "IF", { fixId: "JOIN", course: "2600", altDesc: "+", alt: "01500" }),
    sidLeg("RW27B", "010", "IF", { fixId: "JOIN", course: "2700", altDesc: "+", alt: "01500" }),
    sidLeg("RW08B", "010", "IF", { fixId: "JOIN", course: "0800", altDesc: "+", alt: "01500" }),
    sidLeg("RW09B", "010", "IF", { fixId: "JOIN", course: "0900", altDesc: "+", alt: "01500" }),
    sidLeg("RW10", "010", "IF", { fixId: "JOIN", course: "1000", altDesc: "+", alt: "01500" }),
    pd({
      icao,
      sidId: "GRP1",
      routeType: "5",
      seq: "010",
      fixId: "JOIN",
      path: "TF",
      altDesc: " ",
      alt: "05000",
    }),
    pe({
      icao,
      starId: "GRR1",
      routeType: "6",
      trans: "RW26B",
      seq: "010",
      fixId: "GATE",
      path: "IF",
    }),
    pe({
      icao,
      starId: "GRR1",
      routeType: "5",
      seq: "010",
      fixId: "JOIN",
      path: "TF",
    }),
    pe({
      icao,
      starId: "GRR1",
      routeType: "6",
      trans: "RW10",
      seq: "010",
      fixId: "GATE",
      path: "IF",
    }),
    pf({
      icao,
      appId: "I26L",
      routeType: "I",
      trans: "RW26L",
      seq: "010",
      fixId: "FI26L",
      path: "IF",
    }),
    pf({
      icao,
      appId: "I26L",
      routeType: "I",
      trans: "RW26L",
      seq: "020",
      fixId: "RW26L",
      path: "CF",
    }),
    "",
  ].join("\n");
}
