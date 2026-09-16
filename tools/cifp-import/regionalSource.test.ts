import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { pa, uc } from "./fixedWidthRecords.ts";
import {
  buildRegionalSource,
  formatRegionalReport,
  parseRegionalCliArgs,
  runRegionalCli,
  type RegionalIo,
} from "./regionalSource.ts";
import { runCli } from "./cli.ts";

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

// Synthetic CIFP records:
// KAAA (origin, 0,0)
// KBBB (near, ~10 NM north: lat = 0.1665, lon = 0)
// KCCC (far, ~60 NM north: lat = 1.0, lon = 0)
const SYNTHETIC_CIFP = [
  pa({
    icao: "KAAA",
    name: "ALPHA METRO",
    lat: "N00000000",
    lon: "W000000000",
  }),
  pa({
    icao: "KBBB",
    name: "BRAVO REGIONAL",
    lat: "N00100000", // ~10 NM north
    lon: "W000000000",
  }),
  pa({
    icao: "KCCC",
    name: "CHARLIE REMOTE",
    lat: "N01000000", // ~60 NM north
    lon: "W000000000",
  }),
  // Class B around KAAA: 3 vertices
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

// Synthetic NASR APT covering KAAA and KBBB
const SYNTHETIC_NASR_APT = [
  "FAA_ID,ICAO_ID,FACILITY_TYPE,PUBLIC_USE,TOWER_ON_SITE",
  "AAA,KAAA,AIRPORT,Y,Y",
  "BBB,KBBB,AIRPORT,Y,N",
].join("\n");

// Synthetic NASR TWR covering KAAA
const SYNTHETIC_NASR_TWR = [
  "SITE_NUMBER,FAA_ID,ICAO_ID,TOWER_TYPE,TOWER_HOURS",
  "00001,AAA,KAAA,ATCT,24",
].join("\n");

test("AC5 — buildRegionalSource enriches airports and selects airspace in region", () => {
  const result = buildRegionalSource(SYNTHETIC_CIFP, SYNTHETIC_NASR_APT, SYNTHETIC_NASR_TWR, {
    cifpPath: "FAACIFP18",
    nasrAptPath: "APT.txt",
    nasrTwrPath: "TWR.txt",
    centerAirportId: "KAAA",
    radiusNm: 20,
  });

  expect(result.counts.totalAirports).toBe(3);
  expect(result.counts.selectedAirports).toBe(2); // KAAA and KBBB (KCCC is ~60 NM away)
  expect(result.counts.selectedAirspaces).toBe(1); // KAAA Class B
  expect(result.counts.toweredAirports).toBe(1); // KAAA
  expect(result.counts.publicUseAirports).toBe(2); // KAAA and KBBB

  const kaaa = result.selectedAirports.find((a) => a.airportId === "KAAA");
  expect(kaaa?.serviceMetadata?.publicUse).toBe(true);
  expect(kaaa?.serviceMetadata?.towered).toBe(true);

  const kbbb = result.selectedAirports.find((a) => a.airportId === "KBBB");
  expect(kbbb?.serviceMetadata?.publicUse).toBe(true);
  expect(kbbb?.serviceMetadata?.towered).toBe(false);

  const airspace = result.selectedAirspaces[0];
  expect(airspace?.class).toBe("B");
  expect(airspace?.centerAirportId).toBe("KAAA");
  expect(airspace?.lowerLimit.altitudeFt).toBe(2000);
  expect(airspace?.upperLimit.altitudeFt).toBe(10000);

  // Serialized JSON outputs are deterministic
  expect(result.serialized.airports).toContain('"airportId": "KAAA"');
  expect(result.serialized.airspaces).toContain('"class": "B"');
  expect(result.serialized.regionalSource).toContain('"centerAirportId": "KAAA"');

  const report = formatRegionalReport(result);
  expect(report).toContain("center: KAAA");
  expect(report).toContain("radius: 20 NM");
  expect(report).toContain("towered=1 public=2");
});

test("AC5 — strict regional mode fails when selected airport lacks NASR metadata", () => {
  // Only KAAA is in NASR; KBBB is in CIFP within radius but missing from NASR
  const nasrWithoutBbb = "FAA_ID,ICAO_ID,PUBLIC_USE,TOWER_ON_SITE\nAAA,KAAA,Y,Y\n";

  const result = buildRegionalSource(SYNTHETIC_CIFP, nasrWithoutBbb, undefined, {
    cifpPath: "FAACIFP18",
    nasrAptPath: "APT.txt",
    centerAirportId: "KAAA",
    radiusNm: 20,
    strict: true,
  });

  const missingMeta = result.diagnostics.filter(
    (d) => d.code === "MISSING_AIRPORT_SERVICE_METADATA",
  );
  expect(missingMeta.length).toBeGreaterThanOrEqual(1);
  expect(missingMeta[0]?.airportId).toBe("KBBB");
});

test("AC5 — strict regional mode warns and excludes airspace with invalid vertical limits", () => {
  const badAirspaceCifp = [
    pa({ icao: "KAAA", name: "ALPHA", lat: "N00000000", lon: "W000000000" }),
    // Airspace with lowerLimitUnit = ' ' (NOT_SPECIFIED)
    uc({
      center: "KAAA",
      airspaceClass: "B",
      name: "ALPHA CLASS B",
      seq: 10,
      lat: "N00050000",
      lon: "W000050000",
      boundaryVia: "G",
      lowerLimit: "02000",
      lowerLimitUnit: " ", // invalid unit
      upperLimit: "10000",
      upperLimitUnit: "M",
    }),
  ].join("\n");

  const result = buildRegionalSource(badAirspaceCifp, SYNTHETIC_NASR_APT, undefined, {
    cifpPath: "FAACIFP18",
    nasrAptPath: "APT.txt",
    centerAirportId: "KAAA",
    radiusNm: 20,
    strict: true,
  });

  const limitWarnings = result.diagnostics.filter(
    (d) => d.code === "INVALID_AIRSPACE_VERTICAL_LIMITS",
  );
  expect(limitWarnings.length).toBeGreaterThanOrEqual(1);
  for (const w of limitWarnings) {
    expect(w.severity).toBe("warning");
    expect(w.message).toContain("excluded");
  }
  // No error-severity diagnostics remain from the bad volume.
  expect(result.diagnostics.filter((d) => d.severity === "error")).toHaveLength(0);
  // Bad volume is excluded from selection and serialized output.
  expect(result.selectedAirspaces).toHaveLength(0);
  expect(result.counts.selectedAirspaces).toBe(0);
  expect(result.serialized.airspaces).not.toContain("ALPHA CLASS B");
  expect(JSON.parse(result.serialized.airspaces)).toHaveLength(0);
});

test("AC5 — strict regional mode still writes when only invalid airspaces are present", () => {
  const badAirspaceCifp = [
    pa({ icao: "KAAA", name: "ALPHA", lat: "N00000000", lon: "W000000000" }),
    uc({
      center: "KAAA",
      airspaceClass: "B",
      name: "ALPHA CLASS B",
      seq: 10,
      lat: "N00050000",
      lon: "W000050000",
      boundaryVia: "G",
      lowerLimit: "02000",
      lowerLimitUnit: " ",
      upperLimit: "10000",
      upperLimitUnit: "M",
    }),
  ].join("\n");
  const files: Record<string, string> = {
    FAACIFP18: badAirspaceCifp,
    "APT.txt": SYNTHETIC_NASR_APT,
  };
  const { io, written } = createMockIo(files);

  runRegionalCli(
    [
      "--cifp",
      "FAACIFP18",
      "--nasr-apt",
      "APT.txt",
      "--airport",
      "KAAA",
      "--radius",
      "20",
      "--out",
      "out/reg",
    ],
    io,
  );

  expect(written["out/reg/airports.json"]).toBeDefined();
  expect(written["out/reg/airspaces.json"]).toBeDefined();
  expect(written["out/reg/regional-source.json"]).toBeDefined();
  expect(JSON.parse(written["out/reg/airspaces.json"]!)).toHaveLength(0);
});

test("AC5 — missing NASR metadata still fails closed with no files written", () => {
  // Only KAAA is in NASR; KBBB is in CIFP within radius but missing from NASR
  const nasrWithoutBbb = "FAA_ID,ICAO_ID,PUBLIC_USE,TOWER_ON_SITE\nAAA,KAAA,Y,Y\n";
  const files: Record<string, string> = {
    FAACIFP18: SYNTHETIC_CIFP,
    "APT.txt": nasrWithoutBbb,
  };
  const { io, written, stderrOutput } = createMockIo(files);

  expect(() =>
    runRegionalCli(
      [
        "--cifp",
        "FAACIFP18",
        "--nasr-apt",
        "APT.txt",
        "--airport",
        "KAAA",
        "--radius",
        "20",
        "--out",
        "out/reg",
      ],
      io,
    ),
  ).toThrow(/failed with .* error\(s\)/);

  expect(Object.keys(written)).toHaveLength(0);
  expect(stderrOutput.join("")).toContain("MISSING_AIRPORT_SERVICE_METADATA");
});

test("parseRegionalCliArgs parses all flags and options", () => {
  const parsed = parseRegionalCliArgs([
    "--cifp",
    "FAACIFP18",
    "--nasr-apt",
    "APT.txt",
    "--nasr-twr",
    "TWR.txt",
    "--airport",
    "katl",
    "--radius",
    "40",
    "--out",
    "output/regional",
    "--cycle",
    "2401",
    "--dry-run",
  ]);

  expect(parsed.cifpPath).toBe("FAACIFP18");
  expect(parsed.nasrAptPath).toBe("APT.txt");
  expect(parsed.nasrTwrPath).toBe("TWR.txt");
  expect(parsed.centerAirportId).toBe("KATL");
  expect(parsed.radiusNm).toBe(40);
  expect(parsed.outDir).toBe("output/regional");
  expect(parsed.effectiveCycle).toBe("2401");
  expect(parsed.dryRun).toBe(true);
  expect(parsed.strict).toBe(true);
});

test("AC5 — runRegionalCli fails before writing when source files cannot be read", () => {
  const { io, written } = createMockIo();

  expect(() =>
    runRegionalCli(
      [
        "--cifp",
        "nonexistent-cifp",
        "--nasr-apt",
        "APT.txt",
        "--airport",
        "KAAA",
        "--radius",
        "20",
        "--out",
        "out/reg",
      ],
      io,
    ),
  ).toThrow(/MISSING_SOURCE_FILE/);

  // Proves NO files are written
  expect(Object.keys(written)).toHaveLength(0);
});

test("AC5 — runRegionalCli dry-run performs validation and outputs report without writing files", () => {
  const files: Record<string, string> = {
    FAACIFP18: SYNTHETIC_CIFP,
    "APT.txt": SYNTHETIC_NASR_APT,
    "TWR.txt": SYNTHETIC_NASR_TWR,
  };
  const { io, written, stderrOutput } = createMockIo(files);

  runRegionalCli(
    [
      "--cifp",
      "FAACIFP18",
      "--nasr-apt",
      "APT.txt",
      "--nasr-twr",
      "TWR.txt",
      "--airport",
      "KAAA",
      "--radius",
      "20",
      "--out",
      "out/reg",
      "--dry-run",
    ],
    io,
  );

  expect(Object.keys(written)).toHaveLength(0);
  const combinedStderr = stderrOutput.join("");
  expect(combinedStderr).toContain("center: KAAA");
  expect(combinedStderr).toContain("[dry-run: no files written]");
});

test("AC5 — runRegionalCli writes output files when input is valid", () => {
  const files: Record<string, string> = {
    FAACIFP18: SYNTHETIC_CIFP,
    "APT.txt": SYNTHETIC_NASR_APT,
    "TWR.txt": SYNTHETIC_NASR_TWR,
  };
  const { io, written } = createMockIo(files);

  runRegionalCli(
    [
      "--cifp",
      "FAACIFP18",
      "--nasr-apt",
      "APT.txt",
      "--nasr-twr",
      "TWR.txt",
      "--airport",
      "KAAA",
      "--radius",
      "20",
      "--out",
      "out/reg",
    ],
    io,
  );

  expect(written["out/reg/airports.json"]).toBeDefined();
  expect(written["out/reg/airspaces.json"]).toBeDefined();
  expect(written["out/reg/regional-source.json"]).toBeDefined();

  const parsedAirports = JSON.parse(written["out/reg/airports.json"]!);
  expect(parsedAirports).toHaveLength(2);
  const parsedAirspaces = JSON.parse(written["out/reg/airspaces.json"]!);
  expect(parsedAirspaces).toHaveLength(1);
});

test("runCli routes 'regional' subcommand properly", () => {
  const files: Record<string, string> = {
    FAACIFP18: SYNTHETIC_CIFP,
    "APT.txt": SYNTHETIC_NASR_APT,
    "TWR.txt": SYNTHETIC_NASR_TWR,
  };
  const { io, written } = createMockIo(files);

  runCli(
    [
      "regional",
      "--cifp",
      "FAACIFP18",
      "--nasr-apt",
      "APT.txt",
      "--nasr-twr",
      "TWR.txt",
      "--airport",
      "KAAA",
      "--radius",
      "20",
      "--out",
      "out/reg",
      "--dry-run",
    ],
    io,
  );

  expect(Object.keys(written)).toHaveLength(0);
});

test("AC6 — testdata synthetic regional fixtures parse and run through regional CLI", () => {
  const written: Record<string, string> = {};
  const stderrOutput: string[] = [];

  const io: RegionalIo = {
    readFile: (p: string) => readFileSync(new URL("../../" + p, import.meta.url), "utf8"),
    writeFile: (p: string, b: string) => {
      written[p] = b;
    },
    stderr: (b: string) => {
      stderrOutput.push(b);
    },
    stdout: () => {},
  };

  runRegionalCli(
    [
      "--cifp",
      "testdata/cifp/regional-airspace.cifp",
      "--nasr-apt",
      "testdata/cifp/regional-nasr-apt.txt",
      "--nasr-twr",
      "testdata/cifp/regional-nasr-twr.txt",
      "--airport",
      "KAAA",
      "--radius",
      "25",
      "--out",
      "out/reg-fixture",
    ],
    io,
  );

  expect(written["out/reg-fixture/airports.json"]).toBeDefined();
  expect(written["out/reg-fixture/airspaces.json"]).toBeDefined();
  expect(written["out/reg-fixture/regional-source.json"]).toBeDefined();

  const airports = JSON.parse(written["out/reg-fixture/airports.json"]!);
  expect(airports.map((a: { airportId: string }) => a.airportId).sort()).toEqual([
    "KAAA",
    "KBBB",
    "KCCC",
  ]);

  const airspaces = JSON.parse(written["out/reg-fixture/airspaces.json"]!);
  expect(airspaces.length).toBeGreaterThanOrEqual(1);

  const report = stderrOutput.join("");
  expect(report).toContain("center: KAAA");
  expect(report).toContain("radius: 25 NM");
});
