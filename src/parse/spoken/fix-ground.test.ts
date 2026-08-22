import { expect, test } from "vitest";
import {
  catalogFixAliases,
  groundFixToCatalog,
  groundInstructionFixes,
  normalizeFixKey,
  sanitizeFixIds,
} from "./fix-ground";

const KDEM = [
  "NEMAX",
  "SEMAX",
  "NELBO",
  "SELBO",
  "MERGE",
  "FI27",
  "RW27",
  "MISSD",
  "DEM",
  "OCT",
];

test("sanitizeFixIds uppercases, drops junk, caps the list", () => {
  expect(sanitizeFixIds(["semax", "SEMAX", "nope!", "FI27", "x"])).toEqual(["SEMAX", "FI27"]);
});

test("C-Max / see max normalize to CMAX / SEEMAX", () => {
  expect(normalizeFixKey("C-Max")).toBe("CMAX");
  expect(normalizeFixKey("see max")).toBe("SEEMAX");
  expect(normalizeFixKey("c max")).toBe("CMAX");
});

test("SEMAX aliases cover the C-Max ASR misspelling", () => {
  expect(catalogFixAliases("SEMAX")).toEqual(expect.arrayContaining(["SEMAX", "CMAX", "SEEMAX"]));
  expect(groundFixToCatalog("C-Max", KDEM)).toBe("SEMAX");
  expect(groundFixToCatalog("c max", KDEM)).toBe("SEMAX");
  expect(groundFixToCatalog("see max", KDEM)).toBe("SEMAX");
  expect(groundFixToCatalog("SEMAX", KDEM)).toBe("SEMAX");
});

test("unique edit-distance-1 still snaps SEEMAX; ambiguous / unknown stay null", () => {
  expect(groundFixToCatalog("SEEMAX", KDEM)).toBe("SEMAX");
  expect(groundFixToCatalog("NOPE", KDEM)).toBeNull();
  expect(groundFixToCatalog("CMAX", ["SEMAX", "NEMAX"])).toBe("SEMAX");
  expect(groundFixToCatalog(null, KDEM)).toBeNull();
  expect(groundFixToCatalog("SEMAX", [])).toBeNull();
});

test("CMAX does not steal NEMAX when both are listed", () => {
  expect(groundFixToCatalog("CMAX", ["NEMAX", "SEMAX"])).toBe("SEMAX");
  expect(groundFixToCatalog("NEMAX", KDEM)).toBe("NEMAX");
});

test("groundInstructionFixes snaps DIRECT and CROSS only", () => {
  expect(
    groundInstructionFixes(
      [
        { type: "DIRECT", fixId: "C-Max" },
        { type: "CROSS", fixId: "cmax", altitudeFt: 4000, restriction: "AT" },
        { type: "IDENT" },
      ],
      KDEM,
    ),
  ).toEqual([
    { type: "DIRECT", fixId: "SEMAX" },
    { type: "CROSS", fixId: "SEMAX", altitudeFt: 4000, restriction: "AT" },
    { type: "IDENT" },
  ]);
});
