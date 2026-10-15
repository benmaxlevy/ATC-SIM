import { expect, test } from "vitest";
import atpaVolumesJson from "../../data/kdem/atpa-volumes.json";
import catalogJson from "../../data/kdem/catalog.json";
import fixesJson from "../../data/kdem/fixes.json";
import ilsJson from "../../data/kdem/ils.json";
import ndbsJson from "../../data/kdem/ndbs.json";
import proceduresJson from "../../data/kdem/procedures.json";
import sidsJson from "../../data/kdem/sids.json";
import vorsJson from "../../data/kdem/vors.json";
import { deriveFmaAmzs } from "../../../core/alerts/fmaGeometry";
import { loadCatalog, parseCatalogFiles, type CatalogFileSet } from "../loadCatalog";
import type { FmaGroupAdaptation } from "../types";

function kdemFiles(): CatalogFileSet {
  return structuredClone({
    catalog: catalogJson,
    vors: vorsJson,
    ndbs: ndbsJson,
    ils: ilsJson,
    fixes: fixesJson,
    procedures: proceduresJson,
    sids: sidsJson,
    atpaVolumes: atpaVolumesJson,
  });
}

test("parseCatalogFiles accepts the committed KDEM set", () => {
  const catalog = parseCatalogFiles(kdemFiles());
  expect(catalog.airportId).toBe("KDEM");
  expect(catalog.spokenAliases).toEqual(["DEMO FIELD", "DEMO AIRPORT"]);
  expect(catalog.sids[0]?.id).toBe("BAY1");
  expect(catalog.approaches.find((approach) => approach.id === "ILS27")).toMatchObject({
    locFullScaleHalfWidthFtAtThreshold: 350,
    gsBeamFullWidthDeg: 1.4,
  });
  expect(catalog.approaches.find((approach) => approach.id === "ILS09")).toMatchObject({
    locFullScaleHalfWidthFtAtThreshold: 350,
    gsBeamFullWidthDeg: 1.4,
  });
});

test("omitted ILS envelope fields normalize for a second airport", () => {
  const files = kdemFiles();
  const catalog = files.catalog as { airportId: string; name: string };
  const procedures = files.procedures as {
    airportId: string;
    approaches: Array<Record<string, unknown>>;
  };
  catalog.airportId = "KBBB";
  catalog.name = "Bravo";
  for (const file of [
    files.vors,
    files.ndbs,
    files.ils,
    files.fixes,
    files.procedures,
    files.sids,
  ]) {
    (file as { airportId: string }).airportId = "KBBB";
  }
  (files.atpaVolumes as { airportId: string }).airportId = "KBBB";
  for (const approach of procedures.approaches) {
    delete approach.locFullScaleHalfWidthFtAtThreshold;
    delete approach.gsBeamFullWidthDeg;
  }
  const parsed = parseCatalogFiles(files);
  expect(parsed.airportId).toBe("KBBB");
  expect(parsed.approaches[0]).toMatchObject({
    locFullScaleHalfWidthFtAtThreshold: 350,
    gsBeamFullWidthDeg: 1.4,
  });
});

test("dangling STAR fixId throws", () => {
  const files = kdemFiles();
  const procedures = files.procedures as {
    stars: Array<{ transitions: Array<{ legs: Array<{ fixId: string }> }> }>;
  };
  procedures.stars[0]!.transitions[0]!.legs[0]!.fixId = "NOPE";
  expect(() => parseCatalogFiles(files)).toThrow(/unknown id NOPE/);
});

test("airport identity requires a usable spoken alias set", () => {
  const files = kdemFiles();
  delete (files.catalog as { spokenAliases?: unknown }).spokenAliases;
  expect(() => parseCatalogFiles(files)).toThrow(/spokenAliases/);
  const withBlank = kdemFiles();
  (withBlank.catalog as { spokenAliases: string[] }).spokenAliases = [" "];
  expect(() => parseCatalogFiles(withBlank)).toThrow(/spokenAliases/);
});

test("loadCatalog has no facility-id branch", () => {
  const catalog = loadCatalog("src/scenario/data/kdem");
  expect(catalog.airportId).toBe("KDEM");
  const authoredGroups = catalog.fmaOverrides?.groups ?? [];
  expect(authoredGroups.length).toBeGreaterThan(0);
  expect(new Set(authoredGroups.map((group) => group.id)).size).toBe(authoredGroups.length);
  for (const group of authoredGroups) {
    expect(group.id).toMatch(/^[A-Z0-9]{1,7}$/);
    expect(group.approachIds?.length).toBeGreaterThan(1);
    for (const approachId of group.approachIds ?? []) {
      expect(catalog.approaches.some((approach) => approach.id === approachId)).toBe(true);
    }
  }
  const fma = deriveFmaAmzs(catalog);
  expect(fma.diagnostics).toEqual([]);
  expect(fma.amzs).toHaveLength(authoredGroups.length);
  const loaderSrc = import.meta.glob("../loadCatalog.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = loaderSrc["../loadCatalog.ts"] ?? "";
  expect(src).not.toMatch(/["']KATL["']/);
});

test("catalog-owned FMA overrides parse optional fields and reject malformed geometry/monitoring", () => {
  const files = kdemFiles();
  (files.catalog as Record<string, unknown>).fmaOverrides = {
    groups: [
      {
        id: "PARAL1",
        approachIds: ["ILS27"],
        runwayAliases: { "27": ["R27"] },
        ntzWidthFt: 2000,
        monitoring: { cautionHorizonS: 12 },
      },
    ],
  };
  expect(parseCatalogFiles(files).fmaOverrides?.groups?.[0]).toMatchObject({
    id: "PARAL1",
    approachIds: ["ILS27"],
    runwayAliases: { "27": ["R27"] },
    ntzWidthFt: 2000,
    monitoring: { cautionHorizonS: 12 },
  });

  const malformed = kdemFiles();
  (malformed.catalog as Record<string, unknown>).fmaOverrides = {
    groups: [
      {
        id: "BAD",
        geometry: { amzBoundary: [{ xNm: Number.NaN, yNm: 0 }], runways: [], ntzs: [] },
      },
    ],
  };
  expect(() => parseCatalogFiles(malformed)).toThrow(
    /fmaOverrides\.groups\[0\]\.geometry\.amzBoundary\[0\]\.xNm/,
  );

  const invalidMonitoring = kdemFiles();
  (invalidMonitoring.catalog as Record<string, unknown>).fmaOverrides = {
    groups: [{ id: "BAD", monitoring: { maximumPtlS: 0 } }],
  };
  expect(() => parseCatalogFiles(invalidMonitoring)).toThrow(/maximumPtlS must be positive/);
});

test("trainer-authored FMA geometry requires valid group IDs and resolved references", () => {
  const files = kdemFiles();
  const adaptation = {
    source: "TRAINER_AUTHORED",
    sourceNote: "Synthetic fixture.",
    groups: [{ id: "BAD", approachIds: ["ILS27", "ILS09"] }],
  };
  (files.catalog as Record<string, unknown>).fmaOverrides = adaptation;
  expect(() => parseCatalogFiles(files)).toThrow(/complete geometry/);

  const invalidId = kdemFiles();
  (invalidId.catalog as Record<string, unknown>).fmaOverrides = {
    ...adaptation,
    groups: [{ ...adaptation.groups[0]!, id: "TOOLONG8", approachIds: ["ILS27", "ILS09"] }],
  };
  expect(() => parseCatalogFiles(invalidId)).toThrow(/must match \[A-Z0-9\]\{1,7\}/);

  const unresolved = kdemFiles();
  const polygon = [
    { xNm: 0, yNm: 0 },
    { xNm: 2, yNm: 0 },
    { xNm: 2, yNm: 2 },
    { xNm: 0, yNm: 2 },
  ];
  (unresolved.catalog as Record<string, unknown>).fmaOverrides = {
    ...adaptation,
    groups: [
      {
        id: "OK1",
        approachIds: ["NOPE", "MISSING"],
        geometry: {
          amzBoundary: polygon,
          runways: [
            { runwayId: "09", noz: polygon },
            { runwayId: "27", noz: polygon },
          ],
          ntzs: [{ id: "NTZ1", leftRunwayId: "09", rightRunwayId: "27", polygon }],
        },
      },
    ],
  };
  expect(() => parseCatalogFiles(unresolved)).toThrow(/unresolved approach\/runway references/);
});

test("trainer-authored FMA groups reject silent runtime drops and retain overlapping authored groups", () => {
  const withGroups = () => {
    const files = kdemFiles();
    const catalog = files.catalog as { fmaOverrides: { groups: FmaGroupAdaptation[] } };
    return { files, groups: catalog.fmaOverrides.groups };
  };

  const tooMany = withGroups();
  tooMany.groups[0]!.approachIds = ["ILS27", "ILS27R", "ILS09", "ILS09R", "ILS27"];
  expect(() => parseCatalogFiles(tooMany.files)).toThrow(/must reference 2–4 runway approaches/);

  const mismatched = withGroups();
  mismatched.groups[0]!.runwayIds = ["09", "27"];
  expect(() => parseCatalogFiles(mismatched.files)).toThrow(/runwayIds must match its approachIds/);

  const duplicateNtz = withGroups();
  duplicateNtz.groups[0]!.geometry!.ntzs.push({
    ...duplicateNtz.groups[0]!.geometry!.ntzs[0]!,
    leftRunwayId: "27",
    rightRunwayId: "27R",
  });
  expect(() => parseCatalogFiles(duplicateNtz.files)).toThrow(/geometry\.ntzs\[1\]\.id duplicates/);

  const duplicateCourseLine = withGroups();
  duplicateCourseLine.groups[0]!.geometry!.courseLines![1]!.runwayId =
    duplicateCourseLine.groups[0]!.geometry!.courseLines![0]!.runwayId;
  expect(() => parseCatalogFiles(duplicateCourseLine.files)).toThrow(
    /geometry\.courseLines must include every referenced runway/,
  );

  const overlapping = withGroups();
  overlapping.groups.push({ ...structuredClone(overlapping.groups[0]!), id: "DEMO2" });
  expect(deriveFmaAmzs(parseCatalogFiles(overlapping.files)).amzs.map((amz) => amz.id)).toEqual([
    "DEMO1",
    "DEMO2",
  ]);
});
