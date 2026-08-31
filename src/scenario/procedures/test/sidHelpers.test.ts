import { describe, expect, test } from "vitest";
import { loadCatalog } from "../loadCatalog";
import { sidRouteFixIds, sidSpokenName } from "../sidHelpers";

const kdemCatalog = loadCatalog("src/scenario/data/kdem");

describe("sidRouteFixIds", () => {
  test("BAY1 RW27 NORMA is the ordered route", () => {
    expect(sidRouteFixIds(kdemCatalog, "BAY1", "27", "NORMA")).toEqual(["BAYEE", "BAYNW", "NORMA"]);
  });

  test("unknown SID throws", () => {
    expect(() => sidRouteFixIds(kdemCatalog, "NOPE")).toThrow();
  });
});

test("sidSpokenName uses catalog metadata", () => {
  expect(sidSpokenName(kdemCatalog, "BAY1")).toBe("BAY ONE");
});
