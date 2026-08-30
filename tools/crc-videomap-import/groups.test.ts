// @ts-expect-error tsconfig has no @types/node
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { extractCrcFacilityGroups } from "./groups.ts";
import { parseCrcArtccMaps } from "./parse.ts";
import { CRC_A80_FACILITY_ID, CRC_LOCAL_ARTCC_METADATA_PATH } from "./paths.ts";
import { CRC_DCB_MAIN_COUNT, CRC_DCB_SLOT_COUNT, CRC_DCB_SUBMENU_COUNT } from "./types.ts";
import a80Fixture from "../../testdata/crc-videomaps/map-groups-a80.json";
import missingFixture from "../../testdata/crc-videomaps/map-groups-missing-ambiguous.json";
import sparseFixture from "../../testdata/crc-videomaps/map-groups-sparse-duplicate-empty.json";

const A80_GROUP_IDS = [
  "01HBPTZ9X9H5P64NEEX5YEMCRD",
  "01HBPTZFFS83GZASB8SZEQCEXR",
  "01HBPTZSA1CY64Q8EKQTB699YJ",
  "01HBPV03JS1XBPZWASTZS8JQDH",
  "01HBPVPQVVX7SE3EBE1D84HKCY",
  "01HBPZSPVWRXS3T95H4488YAZQ",
  "01HBPZT46J85GGADXCFPDVN6R4",
  "01HBPZT5389PWRT8AW1GW7F3YQ",
  "01HBPZTD3TC5KEQPF09P7MX3CF",
  "01HBPZTD7D7RCDYYKGKQMN3TRE",
  "01HBPZTJ65JA5EXSG6KMGEWJD8",
  "01HBPZTK6N64J171YT0TX0H1H1",
  "01HBPZTKQ6PTTADVNJSSXXNDKY",
  "01HBQ0DRBFWM0RWYEDJTFG6QSV",
] as const;

const A80_ABSENT_STARS_IDS = [
  7, 62, 86, 87, 136, 969, 975, 976, 979, 980, 981, 982, 990, 991, 996, 997, 998,
];

test("extracts group order, TCPs, MAIN/submenu, duplicates, empty slots, and sparse IDs", () => {
  const extracted = extractCrcFacilityGroups(parseCrcArtccMaps(sparseFixture), CRC_A80_FACILITY_ID);
  expect(extracted.groups.map((group) => group.id)).toEqual([
    "01GRPORDER000000000000001",
    "01GRPORDER000000000000002",
  ]);
  expect(extracted.groups.map((group) => group.sourceIndex)).toEqual([0, 1]);
  expect(extracted.groups[0]?.tcps).toEqual(["1N", "1S"]);
  expect(extracted.groups[1]?.tcps).toEqual(["1K"]);

  const first = extracted.groups[0]!;
  expect(first.main).toHaveLength(CRC_DCB_MAIN_COUNT);
  expect(first.submenu).toHaveLength(CRC_DCB_SUBMENU_COUNT);
  expect(first.main.map((slot) => slot.starsId)).toEqual([7, 1, null, 200, 7, 1]);
  expect(first.submenu.map((slot) => slot.starsId).slice(0, 3)).toEqual([200, null, 1]);
  expect(first.main[2]?.position).toEqual({
    groupId: first.id,
    mainIndex: 2,
  });
  expect(first.submenu[0]?.position).toEqual({
    groupId: first.id,
    submenuIndex: 0,
  });
  expect(first.main[0]?.map?.id).toBe("01GRPSPARSE000000000000007");
  expect(first.main[4]?.map?.id).toBe("01GRPSPARSE000000000000007");
  expect(first.submenu[0]?.map?.id).toBe("01GRPSPARSE000000000000200");
  expect(first.main[2]?.map).toBeUndefined();

  const short = extracted.groups[1]!;
  expect(short.main).toHaveLength(CRC_DCB_MAIN_COUNT);
  expect(short.submenu).toHaveLength(CRC_DCB_SUBMENU_COUNT - 1);
  expect(short.main.map((slot) => slot.starsId)).toEqual([1, null, null, null, null, null]);
  expect(short.submenu.every((slot) => slot.starsId === null)).toBe(true);

  expect(extracted.inventory.map((row) => row.starsId)).toEqual([1, 7, 136, 200]);
  expect(extracted.mapsAbsentFromGroups.map((row) => row.starsId)).toEqual([136]);
  expect(extracted.diagnostics).toEqual([]);
});

test("preserves CRC starsId; DCB slot indexes are layout only", () => {
  const extracted = extractCrcFacilityGroups(parseCrcArtccMaps(sparseFixture), CRC_A80_FACILITY_ID);
  const slot = extracted.groups[0]!.main[0]!;
  expect(slot.starsId).toBe(7);
  expect(slot.position.mainIndex).toBe(0);
  expect(slot.map?.id).toBe("01GRPSPARSE000000000000007");
  expect(slot.map?.id).not.toBe(String(slot.starsId));
  expect(slot.map?.id).not.toBe(String(slot.position.mainIndex));
  expect(slot.map?.starsId).not.toBe(1);
  expect(extracted.inventory.map((row) => row.starsId)).not.toEqual([1, 2, 3, 4]);
});

test("missing and ambiguous starsId refs plus overflow slots emit actionable diagnostics", () => {
  const extracted = extractCrcFacilityGroups(
    parseCrcArtccMaps(missingFixture),
    CRC_A80_FACILITY_ID,
  );
  const groupId = "01GRPDIAG000000000000001";
  expect(extracted.groups[0]?.main.map((slot) => slot.starsId)).toEqual([
    1,
    3,
    999,
    null,
    null,
    null,
  ]);
  expect(extracted.groups[0]?.main[0]?.map?.id).toBe("01GRPMISS00000000000000001");
  expect(extracted.groups[0]?.main[1]?.map).toBeUndefined();
  expect(extracted.groups[0]?.main[2]?.map).toBeUndefined();
  expect(extracted.groups[0]?.submenu[0]?.starsId).toBe(3);
  expect(extracted.groups[0]?.submenu[0]?.map).toBeUndefined();
  expect(extracted.groups[0]?.submenu).toHaveLength(CRC_DCB_SLOT_COUNT - CRC_DCB_MAIN_COUNT);

  expect(extracted.diagnostics.map((row) => row.code)).toEqual([
    "AMBIGUOUS_STARS_ID",
    "MISSING_STARS_ID",
    "AMBIGUOUS_STARS_ID",
    "SLOT_OUT_OF_RANGE",
  ]);

  const missing = extracted.diagnostics.find((row) => row.code === "MISSING_STARS_ID");
  expect(missing?.groupId).toBe(groupId);
  expect(missing?.starsId).toBe(999);
  expect(missing?.slotIndex).toBe(2);
  expect(missing?.message).toMatch(/MAIN\[2\]/);
  expect(missing?.message).toMatch(/starsId 999/);
  expect(missing?.message).toMatch(/assigned inventory/);

  const ambiguous = extracted.diagnostics.filter((row) => row.code === "AMBIGUOUS_STARS_ID");
  expect(ambiguous).toHaveLength(2);
  expect(ambiguous[0]?.mapIds).toEqual([
    "01GRPMISS0000000000000003A",
    "01GRPMISS0000000000000003B",
  ]);
  expect(ambiguous[0]?.message).toMatch(
    /ULIDs 01GRPMISS0000000000000003A, 01GRPMISS0000000000000003B/,
  );
  expect(ambiguous[1]?.slotIndex).toBe(CRC_DCB_MAIN_COUNT);

  const overflow = extracted.diagnostics.find((row) => row.code === "SLOT_OUT_OF_RANGE");
  expect(overflow?.slotIndex).toBe(CRC_DCB_SLOT_COUNT);
  expect(overflow?.starsId).toBe(888);
  expect(overflow?.message).toMatch(/mapIds\[38\]/);
  expect(overflow?.message).toMatch(/not map identity/);

  expect(extracted.inventory).toHaveLength(4);
  expect(extracted.mapsAbsentFromGroups.map((row) => row.starsId)).toEqual([136]);
});

test("facility inventory stays complete when DCB groups omit maps", () => {
  const extracted = extractCrcFacilityGroups(parseCrcArtccMaps(sparseFixture), CRC_A80_FACILITY_ID);
  expect(extracted.inventory.map((row) => row.id)).toEqual([
    "01GRPSPARSE000000000000001",
    "01GRPSPARSE000000000000007",
    "01GRPSPARSE000000000000136",
    "01GRPSPARSE000000000000200",
  ]);
  expect(
    extracted.groups.some((group) =>
      group.main.concat(group.submenu).some((slot) => slot.starsId === 136),
    ),
  ).toBe(false);
  expect(extracted.mapsAbsentFromGroups.map((row) => row.id)).toEqual([
    "01GRPSPARSE000000000000136",
  ]);
});

test("A80 fixture extracts fourteen groups, TCP/MAIN/submenu order, and GEO-only inventory", () => {
  const extracted = extractCrcFacilityGroups(parseCrcArtccMaps(a80Fixture), CRC_A80_FACILITY_ID);
  expect(extracted.facilityId).toBe(CRC_A80_FACILITY_ID);
  expect(extracted.facilityName).toBe("Atlanta TRACON");
  expect(extracted.groups.map((group) => group.id)).toEqual([...A80_GROUP_IDS]);
  expect(extracted.inventory).toHaveLength(90);
  expect(extracted.diagnostics).toEqual([]);

  const first = extracted.groups[0]!;
  expect(first.tcps).toEqual(["1I", "1N", "1S"]);
  expect(first.main.map((slot) => slot.starsId)).toEqual([3, 1, 32, 30, 22, 25]);
  expect(first.submenu.map((slot) => slot.starsId).slice(0, 6)).toEqual([27, 20, 31, 29, 32, 30]);
  expect(first.main[2]?.starsId).toBe(32);
  expect(first.submenu[4]?.starsId).toBe(32);
  expect(first.main[2]?.map?.id).toBe(first.submenu[4]?.map?.id);
  expect(first.main[2]?.map?.id).not.toBe("32");
  expect(first.main[0]?.starsId).toBe(3);
  expect(first.main[0]?.position.mainIndex).toBe(0);

  const third = extracted.groups[2]!;
  expect(third.tcps).toEqual(["1A", "1O", "1V"]);
  expect(third.main.map((slot) => slot.starsId)).toEqual([3, 1, 8, null, 10, 28]);
  expect(third.main[3]?.map).toBeUndefined();

  const short = extracted.groups[3]!;
  expect(short.main).toHaveLength(CRC_DCB_MAIN_COUNT);
  expect(short.submenu).toHaveLength(CRC_DCB_SUBMENU_COUNT - 1);

  const last = extracted.groups[13]!;
  expect(last.tcps).toEqual(["4B"]);
  expect(last.main.map((slot) => slot.starsId)).toEqual([3, null, null, null, null, null]);

  for (const [i, group] of extracted.groups.entries()) {
    expect(group.sourceIndex).toBe(i);
    expect(group.main).toHaveLength(CRC_DCB_MAIN_COUNT);
    expect(group.submenu.length).toBeLessThanOrEqual(CRC_DCB_SUBMENU_COUNT);
    for (const slot of group.main.concat(group.submenu)) {
      if (slot.starsId === null) {
        continue;
      }
      expect(slot.map?.starsId).toBe(slot.starsId);
      expect(slot.map?.id).not.toBe(String(slot.starsId));
      expect(slot.map?.id).not.toBe(
        `${slot.position.groupId}:${slot.position.mainIndex ?? slot.position.submenuIndex}`,
      );
    }
  }

  expect(
    extracted.mapsAbsentFromGroups
      .map((row) => row.starsId)
      .filter((id): id is number => id !== undefined)
      .sort((a, b) => a - b),
  ).toEqual(A80_ABSENT_STARS_IDS);
  expect(extracted.inventory.some((row) => row.starsId === 136)).toBe(true);
  expect(
    extracted.groups.some((group) =>
      group.main.concat(group.submenu).some((slot) => slot.starsId === 136),
    ),
  ).toBe(false);
});

test.skipIf(!existsSync(CRC_LOCAL_ARTCC_METADATA_PATH))(
  "live A80 CRC extraction matches frozen swarm facts",
  () => {
    const artcc = parseCrcArtccMaps(
      JSON.parse(readFileSync(CRC_LOCAL_ARTCC_METADATA_PATH, "utf8")) as unknown,
    );
    const extracted = extractCrcFacilityGroups(artcc, CRC_A80_FACILITY_ID);
    expect(extracted.groups).toHaveLength(14);
    expect(extracted.inventory).toHaveLength(90);
    expect(extracted.groups.map((group) => group.id)).toEqual([...A80_GROUP_IDS]);
    expect(extracted.groups[0]?.tcps).toEqual(["1I", "1N", "1S"]);
    expect(extracted.diagnostics.filter((row) => row.code !== "SLOT_OUT_OF_RANGE")).toEqual([]);
    expect(
      extracted.mapsAbsentFromGroups
        .map((row) => row.starsId)
        .filter((id): id is number => id !== undefined)
        .sort((a, b) => a - b),
    ).toEqual(A80_ABSENT_STARS_IDS);
    for (const group of extracted.groups) {
      expect(group.main).toHaveLength(CRC_DCB_MAIN_COUNT);
      expect(group.submenu.length).toBeLessThanOrEqual(CRC_DCB_SUBMENU_COUNT);
    }
  },
);
