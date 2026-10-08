import { describe, expect, test } from "vitest";
import { pa, pg, pc, pi, pf, uc } from "./fixedWidthRecords.ts";
import {
  buildRegionalPack,
  formatRegionalPackReport,
  parseRegionalPackCliArgs,
  runRegionalPackCli,
} from "./regionalPack.ts";
import type { RegionalIo } from "./regionalSource.ts";

function createMockIo(files: Record<string, string> = {}): {
  io: RegionalIo;
  written: Record<string, string>;
  stderrOutput: string[];
  stdoutOutput: string[];
} {
  const store = { ...files };
  const written: Record<string, string> = {};
  const stderrOutput: string[] = [];
  const stdoutOutput: string[] = [];

  const io: RegionalIo = {
    readFile: (path: string) => {
      if (store[path] !== undefined) {
        return store[path]!;
      }
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    },
    writeFile: (path: string, body: string) => {
      written[path] = body;
    },
    stderr: (body: string) => {
      stderrOutput.push(body);
    },
    stdout: (body: string) => {
      stdoutOutput.push(body);
    },
  };

  return { io, written, stderrOutput, stdoutOutput };
}

// Synthetic fixtures:
// Center: KAAA at 0, 0
// Satellite 1: KBBB at ~10 NM north (N00100000, W000000000), towered, public-use, has runway + approach
// Satellite 2: KCCC at ~15 NM north, untowered, public-use, has runway
// Satellite 3: KDOD at ~20 NM north, towered, private-use, has runway
// Satellite 4: KEEE at ~25 NM north, towered, public-use, NO valid runway (missing length)
const SYNTHETIC_CIFP = [
  // Airports
  pa({ icao: "KAAA", name: "ALPHA METRO", lat: "N00000000", lon: "W000000000" }),
  pa({ icao: "KBBB", name: "BRAVO SATELLITE", lat: "N00100000", lon: "W000000000" }),
  pa({ icao: "KCCC", name: "CHARLIE UNTOWERED", lat: "N00150000", lon: "W000000000" }),
  pa({ icao: "KDOD", name: "DELTA PRIVATE", lat: "N00200000", lon: "W000000000" }),
  pa({ icao: "KEEE", name: "ECHO NO RUNWAY", lat: "N00250000", lon: "W000000000" }),

  // Runways
  pg({
    icao: "KAAA",
    rwy: "RW27",
    lat: "N00000000",
    lon: "W000000000",
    bearing: "2700",
    length: "10000",
  }),
  pg({
    icao: "KBBB",
    rwy: "RW09",
    lat: "N00100000",
    lon: "W000000000",
    bearing: "0900",
    length: "06000",
  }),
  pg({
    icao: "KCCC",
    rwy: "RW18",
    lat: "N00150000",
    lon: "W000000000",
    bearing: "1800",
    length: "04000",
  }),
  pg({
    icao: "KDOD",
    rwy: "RW36",
    lat: "N00200000",
    lon: "W000000000",
    bearing: "3600",
    length: "05000",
  }),
  // KEEE has no PG record

  // Navaids / localizers for KBBB
  pi({
    icao: "KBBB",
    locId: "IBBB",
    lat: "N00100000",
    lon: "W000010000",
    course: "0900",
    rwy: "RW09",
    gsLat: "N00100000",
    gsLon: "W000010000",
  }),
  pc({ icao: "KBBB", id: "BFAF1", lat: "N00100000", lon: "W000050000", type: "  F" }),
  pc({ icao: "KBBB", id: "RW09 ", lat: "N00100000", lon: "W000000000", type: "  M" }),

  // Approach for KBBB
  pf({
    icao: "KBBB",
    appId: "I09  ",
    routeType: "I",
    seq: "010",
    fixId: "BFAF1",
    path: "IF",
    alt: "03000",
    altDesc: "+",
  }),
  pf({
    icao: "KBBB",
    appId: "I09  ",
    routeType: "I",
    seq: "020",
    fixId: "RW09 ",
    path: "CF",
    course: "0900",
    recNav: "IBBB",
  }),

  // Class B Airspace
  uc({
    center: "KAAA",
    airspaceClass: "B",
    name: "ALPHA CLASS B",
    seq: 10,
    lat: "N00050000",
    lon: "W000050000",
    boundaryVia: "G",
    multipleCode: "A",
    lowerLimit: "02000",
    lowerLimitUnit: "M",
    upperLimit: "10000",
    upperLimitUnit: "M",
  }),
  uc({
    center: "KAAA",
    airspaceClass: "B",
    name: "ALPHA CLASS B",
    seq: 20,
    lat: "N00050000",
    lon: "E000050000",
    boundaryVia: "G",
    multipleCode: "A",
    lowerLimit: "02000",
    lowerLimitUnit: "M",
    upperLimit: "10000",
    upperLimitUnit: "M",
  }),
  uc({
    center: "KAAA",
    airspaceClass: "B",
    name: "ALPHA CLASS B",
    seq: 30,
    lat: "S00050000",
    lon: "E000050000",
    boundaryVia: "G",
    multipleCode: "A",
    lowerLimit: "02000",
    lowerLimitUnit: "M",
    upperLimit: "10000",
    upperLimitUnit: "M",
  }),
].join("\n");

const SYNTHETIC_NASR_APT = [
  "FAA_ID,ICAO_ID,FACILITY_TYPE,PUBLIC_USE,TOWER_ON_SITE",
  "AAA,KAAA,AIRPORT,Y,Y",
  "BBB,KBBB,AIRPORT,Y,Y",
  "CCC,KCCC,AIRPORT,Y,N", // untowered
  "DOD,KDOD,AIRPORT,N,Y", // private use
  "EEE,KEEE,AIRPORT,Y,Y", // towered, public, but no valid runway
].join("\n");

const SYNTHETIC_NASR_TWR = [
  "SITE_NUMBER,FAA_ID,ICAO_ID,TOWER_TYPE,TOWER_HOURS",
  "00001.A,AAA,KAAA,ATCT,24",
  "00002.A,BBB,KBBB,ATCT,24",
  "00004.A,KDOD,KDOD,ATCT,16",
  "00005.A,EEE,KEEE,ATCT,24",
].join("\n");

describe("T04-70 regionalPack generator", () => {
  test("AC1: synthetic two-airport source produces a regional pack without KATL/KFTY condition", () => {
    const result = buildRegionalPack(SYNTHETIC_CIFP, SYNTHETIC_NASR_APT, SYNTHETIC_NASR_TWR, {
      cifpPath: "test.cifp",
      nasrAptPath: "apt.txt",
      nasrTwrPath: "twr.txt",
      centerAirportId: "KAAA",
      radiusNm: 40,
      effectiveCycle: "2610",
    });

    expect(result.options.centerAirportId).toBe("KAAA");
    expect(result.options.radiusNm).toBe(40);
    expect(result.manifest.centerAirportId).toBe("KAAA");
    expect(result.manifest.source.effectiveCycle).toBe("2610");
    expect(result.manifest.source.families).toEqual(["CIFP", "CIFP_UC", "NASR_APT", "NASR_TWR"]);
    expect(result.manifest.source.coverage).toEqual([
      { family: "CIFP", supplied: true, sourceId: "test.cifp", cycle: "2610" },
      { family: "CIFP_UC", supplied: true, sourceId: "test.cifp", cycle: "2610" },
      { family: "CIFP_UR", supplied: false, sourceId: "test.cifp", cycle: "2610" },
      { family: "NASR_APT", supplied: true, sourceId: "apt.txt", cycle: "2610" },
      { family: "NASR_TWR", supplied: true, sourceId: "twr.txt", cycle: "2610" },
    ]);

    // Both center and satellite are eligible
    expect(result.eligibleAirports.map((a) => a.icao)).toEqual(["KAAA", "KBBB"]);
    expect(result.excludedAirports.map((a) => a.icao)).toEqual(["KCCC", "KDOD", "KEEE"]);

    // Check satellite KBBB runway and procedure geometry
    const kbbb = result.eligibleAirports.find((a) => a.icao === "KBBB")!;
    expect(kbbb.runways).toHaveLength(1);
    expect(kbbb.runways[0]!.id).toBe("09");
    expect(kbbb.runways[0]!.lengthFt).toBe(6000);
    expect(kbbb.runways[0]!.headingTrueDeg).toBe(90);
    expect(kbbb.hasPublishedApproaches).toBe(true);
    expect(kbbb.catalogRef).toBe("airports/KBBB");

    // Catalog pack emitted for KBBB
    expect(result.catalogs["airports/KBBB"]).toBeDefined();
    expect(result.catalogs["airports/KBBB"]!["catalog.json"]).toBeDefined();
    expect(result.catalogs["airports/KBBB"]!["procedures.json"]).toBeDefined();

    // Airspace parsed
    expect(result.airspaces).toHaveLength(1);
    expect(result.airspaces[0]!.class).toBe("B");
    expect(result.airspaces[0]!.lowerLimit.altitudeFt).toBe(2000);
    expect(result.airspaces[0]!.upperLimit.altitudeFt).toBe(10000);

    const report = formatRegionalPackReport(result);
    expect(report).toContain("cifp regional pack:");
    expect(report).toContain("eligible: KBBB");
    expect(report).toContain("excluded: KCCC");
  });

  test("AC2: fails and writes no output when source files are unavailable", () => {
    const mock = createMockIo({
      "cifp.txt": SYNTHETIC_CIFP,
      // nasr-apt is missing
    });

    expect(() =>
      runRegionalPackCli(
        [
          "--cifp",
          "cifp.txt",
          "--nasr-apt",
          "nonexistent.txt",
          "--airport",
          "KAAA",
          "--radius",
          "40",
          "--out",
          "out/region",
        ],
        mock.io,
      ),
    ).toThrow(/MISSING_SOURCE_FILE/);

    expect(Object.keys(mock.written)).toHaveLength(0);
  });

  test("AC3: airport eligibility distinguishes untowered, private, and missing runway", () => {
    const result = buildRegionalPack(SYNTHETIC_CIFP, SYNTHETIC_NASR_APT, SYNTHETIC_NASR_TWR, {
      cifpPath: "test.cifp",
      nasrAptPath: "apt.txt",
      nasrTwrPath: "twr.txt",
      centerAirportId: "KAAA",
      radiusNm: 40,
    });

    const kccc = result.airports.find((a) => a.icao === "KCCC")!;
    expect(kccc.eligible).toBe(false);
    expect(kccc.exclusionReason).toBe("untowered");

    const kdod = result.airports.find((a) => a.icao === "KDOD")!;
    expect(kdod.eligible).toBe(false);
    expect(kdod.exclusionReason).toBe("private_use");

    const keee = result.airports.find((a) => a.icao === "KEEE")!;
    expect(keee.eligible).toBe(false);
    expect(keee.exclusionReason).toBe("no_valid_runway");
  });

  test("AC7: deterministic output independent of record shuffling", () => {
    // Shuffle lines in CIFP
    const lines = SYNTHETIC_CIFP.split("\n");
    const shuffledLines = [lines[1]!, lines[0]!, ...lines.slice(2)].join("\n");

    const res1 = buildRegionalPack(SYNTHETIC_CIFP, SYNTHETIC_NASR_APT, SYNTHETIC_NASR_TWR, {
      cifpPath: "test.cifp",
      nasrAptPath: "apt.txt",
      nasrTwrPath: "twr.txt",
      centerAirportId: "KAAA",
      radiusNm: 40,
    });

    const res2 = buildRegionalPack(shuffledLines, SYNTHETIC_NASR_APT, SYNTHETIC_NASR_TWR, {
      cifpPath: "test.cifp",
      nasrAptPath: "apt.txt",
      nasrTwrPath: "twr.txt",
      centerAirportId: "KAAA",
      radiusNm: 40,
    });

    expect(res1.serialized.manifest).toBe(res2.serialized.manifest);
    expect(res1.serialized.airports).toBe(res2.serialized.airports);
    expect(res1.serialized.airspace).toBe(res2.serialized.airspace);
  });

  test("CLI argument parsing and dry-run output", () => {
    const args = parseRegionalPackCliArgs([
      "--cifp",
      "test.cifp",
      "--nasr-apt",
      "apt.txt",
      "--airport",
      "KAAA",
      "--radius",
      "40",
      "--cycle",
      "2610",
      "--dry-run",
    ]);

    expect(args.centerAirportId).toBe("KAAA");
    expect(args.radiusNm).toBe(40);
    expect(args.dryRun).toBe(true);
    expect(args.effectiveCycle).toBe("2610");

    const mock = createMockIo({
      "test.cifp": SYNTHETIC_CIFP,
      "apt.txt": SYNTHETIC_NASR_APT,
      "twr.txt": SYNTHETIC_NASR_TWR,
    });

    runRegionalPackCli(
      [
        "--cifp",
        "test.cifp",
        "--nasr-apt",
        "apt.txt",
        "--nasr-twr",
        "twr.txt",
        "--airport",
        "KAAA",
        "--radius",
        "40",
        "--dry-run",
      ],
      mock.io,
    );

    expect(Object.keys(mock.written)).toHaveLength(0);
    expect(mock.stderrOutput.some((s) => s.includes("cifp regional pack:"))).toBe(true);
    expect(mock.stderrOutput.some((s) => s.includes("[dry-run: no files written]"))).toBe(true);
  });

  test("CLI writes all expected files when outDir is provided", () => {
    const mock = createMockIo({
      "test.cifp": SYNTHETIC_CIFP,
      "apt.txt": SYNTHETIC_NASR_APT,
      "twr.txt": SYNTHETIC_NASR_TWR,
    });

    runRegionalPackCli(
      [
        "--cifp",
        "test.cifp",
        "--nasr-apt",
        "apt.txt",
        "--nasr-twr",
        "twr.txt",
        "--airport",
        "KAAA",
        "--radius",
        "40",
        "--out",
        "out/region",
      ],
      mock.io,
    );

    expect(mock.written["out/region/regional.json"]).toBeDefined();
    expect(mock.written["out/region/regional-airports.json"]).toBeDefined();
    expect(mock.written["out/region/regional-airspace.json"]).toBeDefined();
    expect(mock.written["out/region/airports/KBBB/catalog.json"]).toBeDefined();
    expect(mock.written["out/region/airports/KBBB/procedures.json"]).toBeDefined();
  });

  test("catalog closure failure warns and excludes the airport with catalog_error", () => {
    const cifp = [
      pa({ icao: "KAAA", name: "ALPHA METRO", lat: "N00000000", lon: "W000000000" }),
      pa({ icao: "KFFF", name: "FOXTROT BROKEN", lat: "N00300000", lon: "W000000000" }),
      pg({
        icao: "KAAA",
        rwy: "RW27",
        lat: "N00000000",
        lon: "W000000000",
        bearing: "2700",
        length: "10000",
      }),
      pg({
        icao: "KFFF",
        rwy: "RW09",
        lat: "N00300000",
        lon: "W000000000",
        bearing: "0900",
        length: "06000",
      }),
      pc({ icao: "KFFF", id: "FFFAF1", lat: "N00300000", lon: "W000050000", type: "  F" }),
      pc({ icao: "KFFF", id: "RW09 ", lat: "N00300000", lon: "W000000000", type: "  M" }),
      pf({
        icao: "KFFF",
        appId: "I09  ",
        routeType: "I",
        seq: "010",
        fixId: "FFFAF1",
        path: "IF",
        alt: "03000",
        altDesc: "+",
      }),
      pf({
        icao: "KFFF",
        appId: "I09  ",
        routeType: "I",
        seq: "020",
        fixId: "GHOST",
        path: "TF",
        course: "0900",
      }),
    ].join("\n");
    const apt = [
      "FAA_ID,ICAO_ID,FACILITY_TYPE,PUBLIC_USE,TOWER_ON_SITE",
      "AAA,KAAA,AIRPORT,Y,Y",
      "FFF,KFFF,AIRPORT,Y,Y",
    ].join("\n");
    const twr = [
      "SITE_NUMBER,FAA_ID,ICAO_ID,TOWER_TYPE,TOWER_HOURS",
      "00001.A,AAA,KAAA,ATCT,24",
      "00006.A,FFF,KFFF,ATCT,24",
    ].join("\n");

    const result = buildRegionalPack(cifp, apt, twr, {
      cifpPath: "test.cifp",
      nasrAptPath: "apt.txt",
      nasrTwrPath: "twr.txt",
      centerAirportId: "KAAA",
      radiusNm: 90,
    });

    const catalogDiags = result.diagnostics.filter((d) => d.code === "CATALOG_GENERATION_FAILED");
    expect(catalogDiags.length).toBeGreaterThanOrEqual(1);
    for (const d of catalogDiags) {
      expect(d.severity).toBe("warning");
    }
    expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);

    const kfff = result.airports.find((a) => a.icao === "KFFF")!;
    expect(kfff.eligible).toBe(false);
    expect(kfff.exclusionReason).toBe("catalog_error");
    expect(result.eligibleAirports.map((a) => a.icao)).not.toContain("KFFF");

    const mock = createMockIo({ "test.cifp": cifp, "apt.txt": apt, "twr.txt": twr });
    runRegionalPackCli(
      [
        "--cifp",
        "test.cifp",
        "--nasr-apt",
        "apt.txt",
        "--nasr-twr",
        "twr.txt",
        "--airport",
        "KAAA",
        "--radius",
        "90",
        "--out",
        "out/region",
      ],
      mock.io,
    );
    expect(mock.written["out/region/regional.json"]).toBeDefined();
    expect(mock.written["out/region/regional-airports.json"]).toBeDefined();
    expect(mock.written["out/region/regional-airspace.json"]).toBeDefined();
  });

  test("90NM-like pack errors before writing bad airspace and catalog-error airport", () => {
    const badAirspace = [
      uc({
        center: "KAAA",
        airspaceClass: "C",
        name: "BAD CLASS C",
        seq: 10,
        lat: "N00050000",
        lon: "W000050000",
        boundaryVia: "G",
        lowerLimit: "02000",
        lowerLimitUnit: " ",
        upperLimit: "10000",
        upperLimitUnit: "M",
      }),
      uc({
        center: "KAAA",
        airspaceClass: "C",
        name: "BAD CLASS C",
        seq: 20,
        lat: "N00050000",
        lon: "E000050000",
        boundaryVia: "G",
        lowerLimit: "02000",
        lowerLimitUnit: " ",
        upperLimit: "10000",
        upperLimitUnit: "M",
      }),
    ].join("\n");
    const failingAirport = [
      pa({ icao: "KFFF", name: "FOXTROT BROKEN", lat: "N00300000", lon: "W000000000" }),
      pg({
        icao: "KFFF",
        rwy: "RW09",
        lat: "N00300000",
        lon: "W000000000",
        bearing: "0900",
        length: "06000",
      }),
      pc({ icao: "KFFF", id: "FFFAF1", lat: "N00300000", lon: "W000050000", type: "  F" }),
      pc({ icao: "KFFF", id: "RW09 ", lat: "N00300000", lon: "W000000000", type: "  M" }),
      pf({
        icao: "KFFF",
        appId: "I09  ",
        routeType: "I",
        seq: "010",
        fixId: "FFFAF1",
        path: "IF",
        alt: "03000",
        altDesc: "+",
      }),
      pf({
        icao: "KFFF",
        appId: "I09  ",
        routeType: "I",
        seq: "020",
        fixId: "GHOST",
        path: "TF",
        course: "0900",
      }),
    ].join("\n");
    const cifp = [SYNTHETIC_CIFP, badAirspace, failingAirport].join("\n");
    const apt = [...SYNTHETIC_NASR_APT.split("\n"), "FFF,KFFF,AIRPORT,Y,Y"].join("\n");
    const twr = [...SYNTHETIC_NASR_TWR.split("\n"), "00006.A,FFF,KFFF,ATCT,24"].join("\n");

    const result = buildRegionalPack(cifp, apt, twr, {
      cifpPath: "test.cifp",
      nasrAptPath: "apt.txt",
      nasrTwrPath: "twr.txt",
      centerAirportId: "KAAA",
      radiusNm: 90,
    });

    const airspaceWarnings = result.diagnostics.filter(
      (d) => d.code === "INVALID_AIRSPACE_VERTICAL_LIMITS",
    );
    expect(airspaceWarnings.length).toBeGreaterThanOrEqual(1);
    for (const d of airspaceWarnings) {
      expect(d.severity).toBe("error");
      expect(d.message).toContain("excluded");
    }
    const catalogWarnings = result.diagnostics.filter(
      (d) => d.code === "CATALOG_GENERATION_FAILED",
    );
    expect(catalogWarnings.length).toBeGreaterThanOrEqual(1);
    for (const d of catalogWarnings) {
      expect(d.severity).toBe("warning");
    }
    expect(result.diagnostics.filter((d) => d.severity === "error").length).toBeGreaterThan(0);

    // Bad volume absent from output; only the good Class B remains.
    expect(result.airspaces.map((a) => a.name)).not.toContain("BAD CLASS C");
    expect(result.airspaces).toHaveLength(1);

    const kfff = result.airports.find((a) => a.icao === "KFFF")!;
    expect(kfff.eligible).toBe(false);
    expect(kfff.exclusionReason).toBe("catalog_error");

    const mock = createMockIo({ "test.cifp": cifp, "apt.txt": apt, "twr.txt": twr });
    expect(() =>
      runRegionalPackCli(
        [
          "--cifp",
          "test.cifp",
          "--nasr-apt",
          "apt.txt",
          "--nasr-twr",
          "twr.txt",
          "--airport",
          "KAAA",
          "--radius",
          "90",
          "--out",
          "out/region",
        ],
        mock.io,
      ),
    ).toThrow(/no files written/);
    expect(Object.keys(mock.written)).toHaveLength(0);
  });

  test("missing NASR metadata still fails the pack with no files written", () => {
    const aptWithoutBbb = [
      "FAA_ID,ICAO_ID,FACILITY_TYPE,PUBLIC_USE,TOWER_ON_SITE",
      "AAA,KAAA,AIRPORT,Y,Y",
      "CCC,KCCC,AIRPORT,Y,N",
      "DOD,KDOD,AIRPORT,N,Y",
      "EEE,KEEE,AIRPORT,Y,Y",
    ].join("\n");
    // KBBB must be absent from both APT and TWR so no service metadata matches.
    const twrWithoutBbb = [
      "SITE_NUMBER,FAA_ID,ICAO_ID,TOWER_TYPE,TOWER_HOURS",
      "00001.A,AAA,KAAA,ATCT,24",
      "00004.A,KDOD,KDOD,ATCT,16",
      "00005.A,EEE,KEEE,ATCT,24",
    ].join("\n");
    const mock = createMockIo({
      "test.cifp": SYNTHETIC_CIFP,
      "apt.txt": aptWithoutBbb,
      "twr.txt": twrWithoutBbb,
    });

    expect(() =>
      runRegionalPackCli(
        [
          "--cifp",
          "test.cifp",
          "--nasr-apt",
          "apt.txt",
          "--nasr-twr",
          "twr.txt",
          "--airport",
          "KAAA",
          "--radius",
          "40",
          "--out",
          "out/region",
        ],
        mock.io,
      ),
    ).toThrow(/failed with .* error\(s\)/);

    expect(Object.keys(mock.written)).toHaveLength(0);
    expect(mock.stderrOutput.some((s) => s.includes("MISSING_AIRPORT_SERVICE_METADATA"))).toBe(
      true,
    );
  });
});
