import { expect, test } from "vitest";
import {
  assignedVideoMaps,
  crcBrightnessToVideoMapColor,
  crcDcbPositionFromSlotIndex,
  crcGeojsonFilename,
  crcInternalMapId,
  mapHasAllTags,
  mapsAbsentFromGroups,
  starsIdsReferencedInGroups,
} from "./identity.ts";
import {
  CRC_DCB_MAIN_COUNT,
  CRC_DCB_SLOT_COUNT,
  CRC_DCB_SUBMENU_COUNT,
  type CrcDcbGroupPosition,
  type CrcMapGroupSource,
  type NormalizedCrcVideoMap,
} from "./types.ts";

function map(
  partial: Partial<NormalizedCrcVideoMap> & Pick<NormalizedCrcVideoMap, "id">,
): NormalizedCrcVideoMap {
  return {
    title: partial.title ?? partial.id,
    tdm: false,
    tags: [],
    ...partial,
  };
}

test("internal identity is the CRC ULID and is distinct from starsId", () => {
  const row = map({
    id: "01SYNMAPA00000000000000001",
    starsId: 998,
    title: "SYN TDM",
  });
  expect(crcInternalMapId(row)).toBe("01SYNMAPA00000000000000001");
  expect(crcInternalMapId(row)).not.toBe(String(row.starsId));
  expect(crcGeojsonFilename(row.id)).toBe("01SYNMAPA00000000000000001.geojson");
});

test("DCB slot indexes are layout only and are not dense map ids", () => {
  const main = crcDcbPositionFromSlotIndex("G1", 0);
  const submenu = crcDcbPositionFromSlotIndex("G1", CRC_DCB_MAIN_COUNT);
  const last = crcDcbPositionFromSlotIndex("G1", CRC_DCB_SLOT_COUNT - 1);
  expect(main).toEqual<CrcDcbGroupPosition>({ groupId: "G1", mainIndex: 0 });
  expect(submenu).toEqual<CrcDcbGroupPosition>({ groupId: "G1", submenuIndex: 0 });
  expect(last).toEqual<CrcDcbGroupPosition>({
    groupId: "G1",
    submenuIndex: CRC_DCB_SUBMENU_COUNT - 1,
  });
  expect(CRC_DCB_SLOT_COUNT).toBe(38);
  expect(() => crcDcbPositionFromSlotIndex("G1", CRC_DCB_SLOT_COUNT)).toThrow(/out of range/);
  const row = map({ id: "01SYNMAPA00000000000000003", starsId: 3 });
  expect(crcInternalMapId(row)).not.toBe(`${main.groupId}:${main.mainIndex}`);
  expect(crcInternalMapId(row)).not.toBe("1");
});

test("A brightness maps to map; B maps to mapDim", () => {
  expect(crcBrightnessToVideoMapColor("A")).toBe("map");
  expect(crcBrightnessToVideoMapColor("B")).toBe("mapDim");
});

test("assigned inventory keeps maps that groups omit; no densifying of starsId", () => {
  const maps = [
    map({ id: "U1", starsId: 1, title: "ONE" }),
    map({ id: "U3", starsId: 3, title: "THREE" }),
    map({ id: "U136", starsId: 136, title: "GEO ONLY" }),
  ];
  const groups: CrcMapGroupSource[] = [{ id: "G1", tcps: ["1N"], mapIds: [3, 1, null, 3, 1, 1] }];
  const assigned = assignedVideoMaps(maps, ["U1", "U3", "U136"]);
  expect(assigned.map((row) => row.starsId)).toEqual([1, 3, 136]);
  expect(starsIdsReferencedInGroups(groups)).toEqual(new Set([1, 3]));
  expect(mapsAbsentFromGroups(assigned, groups).map((row) => row.id)).toEqual(["U136"]);
  expect(mapHasAllTags({ tags: ["STARS", "A80"] }, ["A80", "STARS"])).toBe(true);
  expect(mapHasAllTags({ tags: ["STARS"] }, ["A80", "STARS"])).toBe(false);
});
