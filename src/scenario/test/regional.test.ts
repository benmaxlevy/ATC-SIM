import { describe, expect, test } from "vitest";
import { parseRegionalPack, type RegionalFacility } from "../regional";
import { loadRegionalAirportCatalog } from "../regionalCatalogs";

// Synthetic test data
const SYNTHETIC_CENTER_ARP = { latDeg: 33.0, lonDeg: -84.0 };

const SYNTHETIC_MANIFEST = {
  schemaVersion: 1,
  centerAirportId: "KSYN",
  radiusNm: 40,
  source: {
    effectiveCycle: "2610",
    families: ["CIFP", "NASR_APT", "NASR_TWR"],
    command: "cifp:regional-pack --airport KSYN --radius 40",
  },
  files: {
    airports: "regional-airports.json",
    airspace: "regional-airspace.json",
  },
};

const SYNTHETIC_AIRPORTS = {
  schemaVersion: 1,
  airports: [
    {
      icao: "KSYN",
      name: "SYNTHETIC CENTER",
      arp: { latDeg: 33.0, lonDeg: -84.0 },
      fieldElevFt: 1000,
      magVarDeg: -5,
      publicUse: true,
      towered: true,
      eligible: true,
      serviceMetadata: {
        publicUse: true,
        towered: true,
        sourceFile: "apt.txt",
        sourceRecordId: "KSYN",
      },
      runways: [
        {
          id: "27",
          threshold: { latDeg: 33.0, lonDeg: -83.98 },
          headingTrueDeg: 270,
          headingMagDeg: 275,
          lengthFt: 9000,
        },
      ],
      hasPublishedApproaches: true,
      catalogRef: ".",
    },
    {
      icao: "KSAT",
      name: "SYNTHETIC SATELLITE",
      arp: { latDeg: 33.2, lonDeg: -84.0 }, // ~12 NM north
      fieldElevFt: 850,
      magVarDeg: -5,
      publicUse: true,
      towered: true,
      eligible: true,
      serviceMetadata: {
        publicUse: true,
        towered: true,
        sourceFile: "apt.txt",
        sourceRecordId: "KSAT",
      },
      runways: [
        {
          id: "09",
          threshold: { latDeg: 33.2, lonDeg: -84.02 },
          headingTrueDeg: 90,
          headingMagDeg: 95,
          lengthFt: 6000,
        },
      ],
      hasPublishedApproaches: true,
      catalogRef: "airports/KSAT",
    },
    {
      icao: "KUNT",
      name: "UNTOWERED SATELLITE",
      arp: { latDeg: 33.1, lonDeg: -83.9 },
      fieldElevFt: 900,
      magVarDeg: -5,
      publicUse: true,
      towered: false,
      eligible: false,
      exclusionReason: "untowered",
      serviceMetadata: { publicUse: true, towered: false, sourceFile: "apt.txt" },
      runways: [
        {
          id: "18",
          threshold: { latDeg: 33.1, lonDeg: -83.9 },
          headingTrueDeg: 180,
          headingMagDeg: 185,
          lengthFt: 4500,
        },
      ],
      hasPublishedApproaches: false,
    },
    {
      icao: "KPVT",
      name: "PRIVATE SATELLITE",
      arp: { latDeg: 33.15, lonDeg: -84.1 },
      fieldElevFt: 800,
      magVarDeg: -5,
      publicUse: false,
      towered: true,
      eligible: false,
      exclusionReason: "private_use",
      serviceMetadata: { publicUse: false, towered: true, sourceFile: "apt.txt" },
      runways: [
        {
          id: "36",
          threshold: { latDeg: 33.15, lonDeg: -84.1 },
          headingTrueDeg: 0,
          headingMagDeg: 5,
          lengthFt: 5000,
        },
      ],
      hasPublishedApproaches: false,
    },
    {
      icao: "KNOR",
      name: "NO RUNWAY AIRPORT",
      arp: { latDeg: 33.05, lonDeg: -84.05 },
      fieldElevFt: 750,
      magVarDeg: -5,
      publicUse: true,
      towered: true,
      eligible: false,
      exclusionReason: "no_valid_runway",
      serviceMetadata: { publicUse: true, towered: true, sourceFile: "apt.txt" },
      runways: [],
      hasPublishedApproaches: false,
    },
  ],
};

const SYNTHETIC_AIRSPACE = {
  schemaVersion: 1,
  airspaces: [
    {
      id: "UC:KSYN:B",
      name: "SYNTHETIC CLASS B",
      type: "CONTROLLED",
      class: "B",
      centerAirportId: "KSYN",
      lowerLimit: {
        altitudeFt: 2000,
        unit: "MSL",
        reference: "MSL",
      },
      upperLimit: {
        altitudeFt: 10000,
        unit: "MSL",
        reference: "MSL",
      },
      segments: [
        {
          sequence: 10,
          boundaryVia: "G",
          boundaryViaType: "GREAT_CIRCLE",
          position: { latDeg: 33.1, lonDeg: -84.1 },
        },
        {
          sequence: 20,
          boundaryVia: "G",
          boundaryViaType: "GREAT_CIRCLE",
          position: { latDeg: 33.1, lonDeg: -83.9 },
        },
        {
          sequence: 30,
          boundaryVia: "G",
          boundaryViaType: "GREAT_CIRCLE",
          position: { latDeg: 32.9, lonDeg: -83.9 },
        },
        {
          sequence: 40,
          boundaryVia: "G",
          boundaryViaType: "GREAT_CIRCLE",
          position: { latDeg: 33.1, lonDeg: -84.1 },
        },
      ],
    },
    {
      id: "UC:KSAT:D",
      name: "SYNTHETIC CLASS D",
      type: "CONTROLLED",
      class: "D",
      centerAirportId: "KSAT",
      lowerLimit: {
        unit: "GND",
        reference: "SURFACE",
        rawAltitude: "SFC",
      },
      upperLimit: {
        altitudeFt: 3500,
        unit: "MSL",
        reference: "MSL",
      },
      segments: [
        {
          sequence: 10,
          boundaryVia: "C",
          boundaryViaType: "CIRCLE",
          position: { latDeg: 33.2, lonDeg: -84.0 },
          arcOrigin: { latDeg: 33.2, lonDeg: -84.0 },
          arcDistanceNm: 4.5,
        },
      ],
    },
  ],
};

const SYNTHETIC_KSAT_CATALOG_FILES: Record<string, unknown> = {
  "./data/ksyn/airports/KSAT/catalog.json": {
    schemaVersion: 1,
    airportId: "KSAT",
    name: "SYNTHETIC SATELLITE",
    spokenAliases: ["SYNTHETIC SATELLITE", "SATELLITE"],
    magVarDeg: -5,
    fieldElevFt: 850,
    arp: { latDeg: 33.2, lonDeg: -84.0 },
    files: {
      vors: "vors.json",
      ndbs: "ndbs.json",
      ils: "ils.json",
      fixes: "fixes.json",
      procedures: "procedures.json",
      sids: "sids.json",
    },
  },
  "./data/ksyn/airports/KSAT/vors.json": { airportId: "KSAT", vors: [] },
  "./data/ksyn/airports/KSAT/ndbs.json": { airportId: "KSAT", ndbs: [] },
  "./data/ksyn/airports/KSAT/ils.json": {
    airportId: "KSAT",
    components: [
      {
        id: "ISAT",
        kind: "LOC",
        name: "ISAT LOC",
        xNm: 0,
        yNm: 0,
        freqMhz: 109.9,
        courseDeg: 90,
      },
      {
        id: "ISATGS",
        kind: "GS",
        name: "ISAT GS",
        xNm: 0,
        yNm: 0,
        freqMhz: 109.9,
        gsAngleDeg: 3.0,
      },
    ],
  },
  "./data/ksyn/airports/KSAT/fixes.json": {
    airportId: "KSAT",
    fixes: [
      { id: "SFAF1", kind: "FAF", xNm: -5, yNm: 0 },
      { id: "RW09", kind: "THRESHOLD", xNm: 0, yNm: 0 },
    ],
  },
  "./data/ksyn/airports/KSAT/procedures.json": {
    airportId: "KSAT",
    stars: [],
    approaches: [
      {
        id: "I09",
        type: "ILS",
        runway: "09",
        name: "ILS RWY 09",
        courseDeg: 90,
        locNavaidId: "ISAT",
        gsNavaidId: "ISATGS",
        fafFixId: "SFAF1",
        thresholdFixId: "RW09",
        legs: [
          { fixId: "SFAF1", altConstraint: { type: "AT_OR_ABOVE", altitudeFt: 2500 } },
          { fixId: "RW09" },
        ],
      },
    ],
  },
  "./data/ksyn/airports/KSAT/sids.json": { airportId: "KSAT", sids: [] },
};

describe("T04-70 runtime regional facility and loader", () => {
  test("AC1 & AC4: synthetic two-airport pack loads center and satellite with generic contract", () => {
    const facility: RegionalFacility = parseRegionalPack(
      SYNTHETIC_MANIFEST,
      SYNTHETIC_AIRPORTS,
      SYNTHETIC_AIRSPACE,
      SYNTHETIC_CENTER_ARP,
    );

    expect(facility.centerAirportId).toBe("KSYN");
    expect(facility.radiusNm).toBe(40);
    expect(facility.arp).toEqual(SYNTHETIC_CENTER_ARP);

    // Eligible destination lookup returns only eligible airports
    const eligible = facility.getEligibleDestinations();
    expect(eligible.map((a) => a.icao)).toEqual(["KSYN", "KSAT"]);

    // Excluded airports are recorded in airport inventory but not in eligible destinations
    expect(facility.hasAirport("KUNT")).toBe(true);
    expect(facility.getAirport("KUNT")?.eligible).toBe(false);
    expect(facility.getAirport("KUNT")?.exclusionReason).toBe("untowered");

    // Runway geometry available for satellite destination
    const sat = facility.getEligibleDestination("KSAT");
    expect(sat.name).toBe("SYNTHETIC SATELLITE");
    expect(sat.runways).toHaveLength(1);
    expect(sat.runways[0]!.id).toBe("09");
    expect(sat.runways[0]!.headingTrueDeg).toBe(90);
    expect(sat.runways[0]!.headingMagDeg).toBe(95);
    expect(sat.runways[0]!.lengthFt).toBe(6000);
    // Projected ENU coordinates exist and are non-zero relative to center ARP
    expect(sat.arpNm.yNm).toBeGreaterThan(10); // ~12 NM north
    expect(sat.runways[0]!.thresholdNm).toBeDefined();

    // Satellite catalog loads and validates atomically
    const satCatalog = loadRegionalAirportCatalog(facility, "KSAT", {
      dataJson: SYNTHETIC_KSAT_CATALOG_FILES,
    });
    expect(satCatalog.airportId).toBe("KSAT");
    expect(satCatalog.approaches).toHaveLength(1);
    expect(satCatalog.approaches[0]!.id).toBe("I09");
    expect(satCatalog.approaches[0]!.locNavaidId).toBe("ISAT");
  });

  test("AC3: destination eligibility rejects untowered, private, and missing status rows", () => {
    const facility = parseRegionalPack(
      SYNTHETIC_MANIFEST,
      SYNTHETIC_AIRPORTS,
      SYNTHETIC_AIRSPACE,
      SYNTHETIC_CENTER_ARP,
    );

    // Untowered airport throws when requested as destination
    expect(() => facility.getEligibleDestination("KUNT")).toThrow(
      /is not an eligible destination \(untowered\)/,
    );

    // Private use airport throws
    expect(() => facility.getEligibleDestination("KPVT")).toThrow(
      /is not an eligible destination \(private_use\)/,
    );

    // Airport with no valid runways throws
    expect(() => facility.getEligibleDestination("KNOR")).toThrow(
      /is not an eligible destination \(no_valid_runway\)/,
    );

    // Unknown airport throws
    expect(() => facility.getEligibleDestination("KXYZ")).toThrow(
      /Unknown regional destination airport: KXYZ/,
    );
  });

  test("AC4: satellite catalog loading rejects unknown airport, mismatched ID, and dangling refs", () => {
    const facility = parseRegionalPack(
      SYNTHETIC_MANIFEST,
      SYNTHETIC_AIRPORTS,
      SYNTHETIC_AIRSPACE,
      SYNTHETIC_CENTER_ARP,
    );

    // Unknown airport
    expect(() => loadRegionalAirportCatalog(facility, "KUNKNOWN")).toThrow(
      /unknown airport 'KUNKNOWN'/,
    );

    // Airport without catalogRef
    expect(() => loadRegionalAirportCatalog(facility, "KUNT")).toThrow(
      /has no procedure catalog reference/,
    );

    // Mismatched airportId in catalog file
    const mismatchedFiles = {
      ...SYNTHETIC_KSAT_CATALOG_FILES,
      "./data/ksyn/airports/KSAT/catalog.json": {
        ...(SYNTHETIC_KSAT_CATALOG_FILES["./data/ksyn/airports/KSAT/catalog.json"] as object),
        airportId: "KWRG",
      },
      "./data/ksyn/airports/KSAT/vors.json": { airportId: "KWRG", vors: [] },
      "./data/ksyn/airports/KSAT/ndbs.json": { airportId: "KWRG", ndbs: [] },
      "./data/ksyn/airports/KSAT/ils.json": { airportId: "KWRG", components: [] },
      "./data/ksyn/airports/KSAT/fixes.json": { airportId: "KWRG", fixes: [] },
      "./data/ksyn/airports/KSAT/procedures.json": {
        airportId: "KWRG",
        stars: [],
        approaches: [],
      },
      "./data/ksyn/airports/KSAT/sids.json": { airportId: "KWRG", sids: [] },
    };
    expect(() =>
      loadRegionalAirportCatalog(facility, "KSAT", { dataJson: mismatchedFiles }),
    ).toThrow(/airportId mismatch: expected 'KSAT' but catalog declares 'KWRG'/);

    // Dangling reference in approach (loc navaid missing)
    const danglingFiles = {
      ...SYNTHETIC_KSAT_CATALOG_FILES,
      "./data/ksyn/airports/KSAT/ils.json": {
        airportId: "KSAT",
        components: [
          // Missing ISAT!
          {
            id: "ISATGS",
            kind: "GS",
            name: "ISAT GS",
            xNm: 0,
            yNm: 0,
            freqMhz: 109.9,
            gsAngleDeg: 3.0,
          },
        ],
      },
    };
    expect(() => loadRegionalAirportCatalog(facility, "KSAT", { dataJson: danglingFiles })).toThrow(
      /approach I09\.locNavaidId references unknown id ISAT/,
    );
  });

  test("AC5: controlled airspace loads with projected boundaries and rejects invalid limits", () => {
    const facility = parseRegionalPack(
      SYNTHETIC_MANIFEST,
      SYNTHETIC_AIRPORTS,
      SYNTHETIC_AIRSPACE,
      SYNTHETIC_CENTER_ARP,
    );

    const airspaces = facility.getAirspaces();
    expect(airspaces).toHaveLength(2);

    const classB = airspaces.find((a) => a.class === "B")!;
    expect(classB.name).toBe("SYNTHETIC CLASS B");
    expect(classB.lowerLimitFt).toBe(2000);
    expect(classB.upperLimitFt).toBe(10000);
    expect(classB.segments).toHaveLength(4);
    expect(classB.segments[0]!.positionNm).toBeDefined();

    const classD = airspaces.find((a) => a.class === "D")!;
    expect(classD.name).toBe("SYNTHETIC CLASS D");
    expect(classD.lowerLimitFt).toBe(0); // Surface
    expect(classD.upperLimitFt).toBe(3500);
    expect(classD.segments[0]!.boundaryViaType).toBe("CIRCLE");
    expect(classD.segments[0]!.arcDistanceNm).toBe(4.5);
    expect(classD.segments[0]!.arcOriginNm).toBeDefined();

    // Rejection 1: lowerLimit > upperLimit
    const invalidAltAirspace = {
      ...SYNTHETIC_AIRSPACE,
      airspaces: [
        {
          ...SYNTHETIC_AIRSPACE.airspaces[0]!,
          lowerLimit: { altitudeFt: 12000, unit: "MSL", reference: "MSL" },
          upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
        },
      ],
    };
    expect(() =>
      parseRegionalPack(
        SYNTHETIC_MANIFEST,
        SYNTHETIC_AIRPORTS,
        invalidAltAirspace,
        SYNTHETIC_CENTER_ARP,
      ),
    ).toThrow(/lower limit 12000 exceeds upper limit 10000/);

    // Rejection 2: unsupported boundary via
    const invalidViaAirspace = {
      ...SYNTHETIC_AIRSPACE,
      airspaces: [
        {
          ...SYNTHETIC_AIRSPACE.airspaces[0]!,
          segments: [
            {
              sequence: 10,
              boundaryVia: "Z",
              boundaryViaType: "UNSUPPORTED",
              position: { latDeg: 33.1, lonDeg: -84.1 },
            },
          ],
        },
      ],
    };
    expect(() =>
      parseRegionalPack(
        SYNTHETIC_MANIFEST,
        SYNTHETIC_AIRPORTS,
        invalidViaAirspace,
        SYNTHETIC_CENTER_ARP,
      ),
    ).toThrow(/unsupported boundary via: UNSUPPORTED/);

    // Rejection 3: arc segment missing origin
    const invalidArcAirspace = {
      ...SYNTHETIC_AIRSPACE,
      airspaces: [
        {
          ...SYNTHETIC_AIRSPACE.airspaces[1]!,
          segments: [
            {
              sequence: 10,
              boundaryVia: "C",
              boundaryViaType: "CIRCLE",
              position: { latDeg: 33.2, lonDeg: -84.0 },
              // arcOrigin missing!
            },
          ],
        },
      ],
    };
    expect(() =>
      parseRegionalPack(
        SYNTHETIC_MANIFEST,
        SYNTHETIC_AIRPORTS,
        invalidArcAirspace,
        SYNTHETIC_CENTER_ARP,
      ),
    ).toThrow(/requires arcOrigin coordinates/);
  });

  test("AC7: rejects duplicate airport IDs, duplicate airspace IDs, and missing metadata", () => {
    // Duplicate airport ID
    const duplicateAirports = {
      ...SYNTHETIC_AIRPORTS,
      airports: [
        ...SYNTHETIC_AIRPORTS.airports,
        {
          ...SYNTHETIC_AIRPORTS.airports[0]!,
          name: "DUPLICATE CENTER",
        },
      ],
    };
    expect(() =>
      parseRegionalPack(
        SYNTHETIC_MANIFEST,
        duplicateAirports,
        SYNTHETIC_AIRSPACE,
        SYNTHETIC_CENTER_ARP,
      ),
    ).toThrow(/Duplicate airport ICAO in regional pack: KSYN/);

    // Duplicate airspace ID
    const duplicateAirspace = {
      ...SYNTHETIC_AIRSPACE,
      airspaces: [
        ...SYNTHETIC_AIRSPACE.airspaces,
        {
          ...SYNTHETIC_AIRSPACE.airspaces[0]!,
          name: "DUPLICATE CLASS B",
        },
      ],
    };
    expect(() =>
      parseRegionalPack(
        SYNTHETIC_MANIFEST,
        SYNTHETIC_AIRPORTS,
        duplicateAirspace,
        SYNTHETIC_CENTER_ARP,
      ),
    ).toThrow(/Duplicate airspace ID in regional pack: UC:KSYN:B/);

    // Missing center airport
    const missingCenterManifest = {
      ...SYNTHETIC_MANIFEST,
      centerAirportId: "KMISSING",
    };
    expect(() =>
      parseRegionalPack(missingCenterManifest, SYNTHETIC_AIRPORTS, SYNTHETIC_AIRSPACE),
    ).toThrow(/center airport 'KMISSING' not found in airports list/);
  });

  test("T04-87: rejects malformed types, references, provenance, limits, and boundaries", () => {
    const parse = (
      airports: unknown = SYNTHETIC_AIRPORTS,
      airspace: unknown = SYNTHETIC_AIRSPACE,
      manifest: unknown = SYNTHETIC_MANIFEST,
    ) => parseRegionalPack(manifest, airports, airspace, SYNTHETIC_CENTER_ARP);

    expect(() =>
      parse(undefined, {
        ...SYNTHETIC_AIRSPACE,
        airspaces: [{ ...SYNTHETIC_AIRSPACE.airspaces[0]!, type: "UNKNOWN" }],
      }),
    ).toThrow(/unsupported type: UNKNOWN/);

    expect(() =>
      parse({
        ...SYNTHETIC_AIRPORTS,
        airports: [
          SYNTHETIC_AIRPORTS.airports[0]!,
          { ...SYNTHETIC_AIRPORTS.airports[1]!, catalogRef: "." },
        ],
      }),
    ).toThrow(/Duplicate regional catalog reference/);

    expect(() =>
      parse(undefined, {
        ...SYNTHETIC_AIRSPACE,
        airspaces: [
          {
            ...SYNTHETIC_AIRSPACE.airspaces[0]!,
            lowerLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
            upperLimit: { altitudeFt: 10000, unit: "MSL", reference: "MSL" },
          },
        ],
      }),
    ).toThrow(/lower limit 10000 exceeds upper limit 10000/);

    expect(() =>
      parse(undefined, {
        ...SYNTHETIC_AIRSPACE,
        airspaces: [
          {
            ...SYNTHETIC_AIRSPACE.airspaces[0]!,
            segments: [
              {
                ...SYNTHETIC_AIRSPACE.airspaces[0]!.segments[0]!,
                boundaryViaType: "END",
              },
              ...SYNTHETIC_AIRSPACE.airspaces[0]!.segments.slice(1, 3),
            ],
          },
        ],
      }),
    ).toThrow(/open or degenerate closed boundary/);

    expect(() =>
      parse(undefined, undefined, {
        ...SYNTHETIC_MANIFEST,
        source: {
          ...SYNTHETIC_MANIFEST.source,
          coverage: [{ family: "CIFP", supplied: true, sourceId: "/home/local.cifp" }],
        },
      } as unknown),
    ).toThrow(/portable relative reference/);

    const incompleteEligible = parse({
      ...SYNTHETIC_AIRPORTS,
      airports: [
        {
          ...SYNTHETIC_AIRPORTS.airports[0]!,
          serviceMetadata: { publicUse: true, towered: true, sourceFile: "apt.txt" },
        },
      ],
    } as unknown);
    expect(incompleteEligible.getEligibleDestinations()).toHaveLength(0);
    expect(incompleteEligible.getAirport("KSYN")?.exclusionReason).toBe("missing_catalog");

    const mismatchedStatus = parse({
      ...SYNTHETIC_AIRPORTS,
      airports: [
        {
          ...SYNTHETIC_AIRPORTS.airports[0]!,
          towered: false,
        },
      ],
    } as unknown);
    expect(mismatchedStatus.getEligibleDestinations()).toHaveLength(0);

    for (const reference of [
      "",
      "/tmp/apt.txt",
      "C:\\\\apt.txt",
      "\\\\server\\apt.txt",
      "../apt.txt",
    ]) {
      expect(() =>
        parse({
          ...SYNTHETIC_AIRPORTS,
          airports: [
            {
              ...SYNTHETIC_AIRPORTS.airports[0]!,
              serviceMetadata: {
                ...SYNTHETIC_AIRPORTS.airports[0]!.serviceMetadata,
                sourceFile: reference,
              },
            },
          ],
        } as unknown),
      ).toThrow(/portable relative reference/);
    }

    expect(() =>
      parse(undefined, undefined, {
        ...SYNTHETIC_MANIFEST,
        source: { ...SYNTHETIC_MANIFEST.source, command: "pack --input ../apt.txt" },
      }),
    ).toThrow(/portable relative reference/);

    expect(() =>
      parse({
        ...SYNTHETIC_AIRPORTS,
        airports: [
          {
            ...SYNTHETIC_AIRPORTS.airports[0]!,
            runways: [{ ...SYNTHETIC_AIRPORTS.airports[0]!.runways[0]!, headingTrueDeg: 360 }],
          },
        ],
      } as unknown),
    ).toThrow(/headings must be in \[0, 360\)/);
  });
});
