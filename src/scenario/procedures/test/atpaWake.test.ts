import { expect, test } from "vitest";
import atpaVolumesJson from "../../data/kdem/atpa-volumes.json";
import catalogJson from "../../data/kdem/catalog.json";
import fixesJson from "../../data/kdem/fixes.json";
import ilsJson from "../../data/kdem/ils.json";
import ndbsJson from "../../data/kdem/ndbs.json";
import proceduresJson from "../../data/kdem/procedures.json";
import sidsJson from "../../data/kdem/sids.json";
import vorsJson from "../../data/kdem/vors.json";
import { FAA_CWT_WAKE_ADAPTATION, lookupAtpaWakeMinimum } from "../atpaWake";
import { parseCatalogFiles, type CatalogFileSet } from "../loadCatalog";

test.each([
  ["A", "B", 5],
  ["B", "I", 5],
  ["C", "F", 3.5],
  ["E", "I", 4],
] as const)("uses leader row %s and follower column %s", (leader, follower, expected) => {
  expect(lookupAtpaWakeMinimum(FAA_CWT_WAKE_ADAPTATION, leader, follower)).toMatchObject({
    kind: "wake",
    requiredNm: expected,
  });
});

test.each([
  ["F", "A"],
  ["A", "A"],
] as const)("blank relationship %s/%s resolves to NOWGT", (leader, follower) => {
  expect(lookupAtpaWakeMinimum(FAA_CWT_WAKE_ADAPTATION, leader, follower)).toEqual({
    kind: "nowgt",
    requiredNm: 10,
    leaderCategory: leader,
    followerCategory: follower,
  });
});

test.each([[undefined, "I"], ["A", undefined], ["Z", "I"]] as const)(
  "missing or invalid category resolves to NOWGT",
  (leader, follower) => {
    expect(lookupAtpaWakeMinimum(FAA_CWT_WAKE_ADAPTATION, leader, follower)).toMatchObject({
      kind: "nowgt",
      requiredNm: 10,
    });
  },
);

test("disabled wake adaptation leaves volume eligible for basic/reduced policy", () => {
  expect(
    lookupAtpaWakeMinimum({ ...FAA_CWT_WAKE_ADAPTATION, enabled: false }, "A", "B"),
  ).toBeUndefined();
});

function kdemFiles(): CatalogFileSet {
  const files = structuredClone({
    catalog: catalogJson,
    vors: vorsJson,
    ndbs: ndbsJson,
    ils: ilsJson,
    fixes: fixesJson,
    procedures: proceduresJson,
    sids: sidsJson,
    atpaVolumes: atpaVolumesJson,
  });
  const volumes = files.atpaVolumes as { atpaVolumes: Array<Record<string, unknown>> };
  volumes.atpaVolumes[0]!.wakeAdaptation = {
    enabled: true,
    nowgtSeparationNm: 10,
    matrix: { A: { B: 5 } },
  };
  return files;
}

test("catalog loader preserves generic per-volume wake adaptation", () => {
  const catalog = parseCatalogFiles(kdemFiles());
  expect(catalog.atpaVolumes[0]?.wakeAdaptation).toEqual({
    enabled: true,
    nowgtSeparationNm: 10,
    matrix: { A: { B: 5 } },
  });
});

test("catalog loader rejects invalid wake categories without facility logic", () => {
  const files = kdemFiles();
  const volume = files.atpaVolumes as { atpaVolumes: Array<Record<string, unknown>> };
  (volume.atpaVolumes[0]!.wakeAdaptation as { matrix: Record<string, unknown> }).matrix.Z = {
    A: 5,
  };
  expect(() => parseCatalogFiles(files)).toThrow(/invalid leader category Z/);
});
