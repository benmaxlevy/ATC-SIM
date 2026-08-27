import { expect, test } from "vitest";
import { DEG2RAD, normalizeHeadingDeg } from "@core";
import { loadCatalog } from "./procedures/loadCatalog";
import {
  alongCourseDistanceNm,
  atpaVolumeThreshold,
  isInsideAtpaVolume,
  lateralOffsetNm,
  type AtpaVolumeGeometry,
} from "./atpaVolume";

const catalog = loadCatalog("kdem");

function volumeById(id: string) {
  const volume = catalog.atpaVolumes.find((item) => item.id === id);
  expect(volume, id).toBeDefined();
  return volume!;
}

function inboundPose(
  geometry: AtpaVolumeGeometry,
  alongNm: number,
  lateralNm: number,
  headingDeg: number,
  altitudeFt: number,
) {
  const rad = normalizeHeadingDeg(geometry.courseDeg + 180) * DEG2RAD;
  return {
    xNm: geometry.xNm + alongNm * Math.sin(rad) + lateralNm * Math.cos(rad),
    yNm: geometry.yNm + alongNm * Math.cos(rad) - lateralNm * Math.sin(rad),
    headingDeg,
    altitudeFt,
  };
}

test("T02-43 AC1 — ATPA27/ATPA09 resolve threshold xy and inbound course from the approach", () => {
  const atpa27 = volumeById("ATPA27");
  const atpa09 = volumeById("ATPA09");
  const geom27 = atpaVolumeThreshold(catalog, atpa27);
  const geom09 = atpaVolumeThreshold(catalog, atpa09);
  const rw27 = catalog.fixes.find((item) => item.id === "RW27")!;
  const rw09 = catalog.fixes.find((item) => item.id === "RW09")!;
  expect(geom27).toEqual({ xNm: rw27.xNm, yNm: rw27.yNm, courseDeg: 270 });
  expect(geom09).toEqual({ xNm: rw09.xNm, yNm: rw09.yNm, courseDeg: 90 });
});

test("along-course distance is positive inbound and negative past the threshold", () => {
  const geom27 = atpaVolumeThreshold(catalog, volumeById("ATPA27"));
  expect(alongCourseDistanceNm(geom27, 8, 0)).toBeCloseTo(8, 9);
  expect(alongCourseDistanceNm(geom27, -1, 0)).toBeCloseTo(-1, 9);

  const geom09 = atpaVolumeThreshold(catalog, volumeById("ATPA09"));
  const inbound09 = inboundPose(geom09, 8, 0, geom09.courseDeg, 3000);
  expect(alongCourseDistanceNm(geom09, inbound09.xNm, inbound09.yNm)).toBeCloseTo(8, 9);
  const past09 = inboundPose(geom09, -1, 0, geom09.courseDeg, 3000);
  expect(alongCourseDistanceNm(geom09, past09.xNm, past09.yNm)).toBeCloseTo(-1, 9);
});

test("lateral offset is the perpendicular distance from the final centerline", () => {
  const geom27 = atpaVolumeThreshold(catalog, volumeById("ATPA27"));
  expect(lateralOffsetNm(geom27, 8, 0)).toBeCloseTo(0, 9);
  expect(Math.abs(lateralOffsetNm(geom27, 8, 1.5))).toBeCloseTo(1.5, 9);

  const geom09 = atpaVolumeThreshold(catalog, volumeById("ATPA09"));
  const onCourse = inboundPose(geom09, 8, 0, geom09.courseDeg, 3000);
  const offset = inboundPose(geom09, 8, 1.5, geom09.courseDeg, 3000);
  expect(lateralOffsetNm(geom09, onCourse.xNm, onCourse.yNm)).toBeCloseTo(0, 9);
  expect(Math.abs(lateralOffsetNm(geom09, offset.xNm, offset.yNm))).toBeCloseTo(1.5, 9);
});

test("T02-43 AC4 — RW27 final at 8 NM / 3000 ft / 272 is inside; rejects out, lateral, high, heading", () => {
  const volume = volumeById("ATPA27");
  const geometry = atpaVolumeThreshold(catalog, volume);
  expect(isInsideAtpaVolume(geometry, volume, inboundPose(geometry, 8, 0, 272, 3000))).toBe(true);
  expect(isInsideAtpaVolume(geometry, volume, inboundPose(geometry, 20, 0, 272, 3000))).toBe(false);
  expect(isInsideAtpaVolume(geometry, volume, inboundPose(geometry, 8, 3, 272, 3000))).toBe(false);
  expect(isInsideAtpaVolume(geometry, volume, inboundPose(geometry, 8, 0, 272, 9000))).toBe(false);
  expect(isInsideAtpaVolume(geometry, volume, inboundPose(geometry, 8, 0, 200, 3000))).toBe(false);
});

test("T02-43 AC5 — RW09 uses the same helpers with only the volume row changed", () => {
  const volume = volumeById("ATPA09");
  const geometry = atpaVolumeThreshold(catalog, volume);
  expect(isInsideAtpaVolume(geometry, volume, inboundPose(geometry, 8, 0, 92, 3000))).toBe(true);
  expect(isInsideAtpaVolume(geometry, volume, inboundPose(geometry, 20, 0, 92, 3000))).toBe(false);
  expect(isInsideAtpaVolume(geometry, volume, inboundPose(geometry, 8, 3, 92, 3000))).toBe(false);
  expect(isInsideAtpaVolume(geometry, volume, inboundPose(geometry, 8, 0, 92, 9000))).toBe(false);
  expect(isInsideAtpaVolume(geometry, volume, inboundPose(geometry, 8, 0, 20, 3000))).toBe(false);
});

test("heading comparison wraps at 360", () => {
  const volume = volumeById("ATPA27");
  const geometry = { xNm: 0, yNm: 0, courseDeg: 10 };
  const track = inboundPose(geometry, 8, 0, 350, 3000);
  expect(isInsideAtpaVolume(geometry, { ...volume, courseToleranceDeg: 30 }, track)).toBe(true);
  expect(isInsideAtpaVolume(geometry, { ...volume, courseToleranceDeg: 10 }, track)).toBe(false);
});

test("T02-43 AC5/AC6 — helper source has no facility or runway branch and names R07", () => {
  const sources = import.meta.glob("./atpaVolume.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./atpaVolume.ts"] ?? "";
  expect(src).toMatch(/R07/);
  expect(src).toMatch(/authored trainer adaptation/i);
  expect(src).toMatch(/basic radar/);
  expect(src).not.toMatch(/wakeCategory/);
  expect(src).not.toMatch(/KDEM/);
  expect(src).not.toMatch(/ILS27/);
  expect(src).not.toMatch(/ILS09/);
  expect(src).not.toMatch(/RW27/);
  expect(src).not.toMatch(/RW09/);
});
