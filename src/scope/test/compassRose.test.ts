import { describe, expect, it } from "vitest";
import {
  COMPASS_ROSE_LABEL_OFFSET_PX,
  COMPASS_ROSE_MAJOR_TICK_PX,
  COMPASS_ROSE_MEDIUM_TICK_PX,
  COMPASS_ROSE_MINOR_TICK_PX,
  COMPASS_ROSE_TICK_INTERVAL_DEG,
  formatCompassRoseHeading,
  generateCompassRoseGeometry,
} from "../compassRose";

describe("Compass Rose geometry generator", () => {
  const origin = { x: 400, y: 400 };
  const radiusPx = 250;

  it("AC1 — generates exactly 72 ticks at 5-degree intervals from 0° to 355°", () => {
    const geo = generateCompassRoseGeometry(origin, radiusPx);
    expect(geo.origin).toEqual(origin);
    expect(geo.radiusPx).toBe(radiusPx);
    expect(geo.ticks).toHaveLength(72);

    for (let i = 0; i < 72; i += 1) {
      const expectedDeg = i * 5;
      expect(geo.ticks[i]?.deg).toBe(expectedDeg);
    }
  });

  it("AC1 — partitions ticks into 12 major, 24 medium, and 36 minor ticks with exact lengths", () => {
    const geo = generateCompassRoseGeometry(origin, radiusPx);
    const major = geo.ticks.filter((t) => t.kind === "major");
    const medium = geo.ticks.filter((t) => t.kind === "medium");
    const minor = geo.ticks.filter((t) => t.kind === "minor");

    expect(major).toHaveLength(12);
    expect(medium).toHaveLength(24);
    expect(minor).toHaveLength(36);

    for (const tick of major) {
      expect(tick.deg % 30).toBe(0);
      const len = Math.hypot(tick.x1 - tick.x2, tick.y1 - tick.y2);
      expect(len).toBeCloseTo(COMPASS_ROSE_MAJOR_TICK_PX, 5);
    }

    for (const tick of medium) {
      expect(tick.deg % 10).toBe(0);
      expect(tick.deg % 30).not.toBe(0);
      const len = Math.hypot(tick.x1 - tick.x2, tick.y1 - tick.y2);
      expect(len).toBeCloseTo(COMPASS_ROSE_MEDIUM_TICK_PX, 5);
    }

    for (const tick of minor) {
      expect(tick.deg % 10).not.toBe(0);
      expect(tick.deg % 5).toBe(0);
      const len = Math.hypot(tick.x1 - tick.x2, tick.y1 - tick.y2);
      expect(len).toBeCloseTo(COMPASS_ROSE_MINOR_TICK_PX, 5);
    }
  });

  it("AC1 — generates 12 3-digit heading labels radially offset inward by 22px", () => {
    const geo = generateCompassRoseGeometry(origin, radiusPx);
    expect(geo.labels).toHaveLength(12);

    const expectedLabels = [
      { deg: 0, text: "360" },
      { deg: 30, text: "030" },
      { deg: 60, text: "060" },
      { deg: 90, text: "090" },
      { deg: 120, text: "120" },
      { deg: 150, text: "150" },
      { deg: 180, text: "180" },
      { deg: 210, text: "210" },
      { deg: 240, text: "240" },
      { deg: 270, text: "270" },
      { deg: 300, text: "300" },
      { deg: 330, text: "330" },
    ];

    for (let i = 0; i < 12; i += 1) {
      expect(geo.labels[i]?.deg).toBe(expectedLabels[i]!.deg);
      expect(geo.labels[i]?.text).toBe(expectedLabels[i]!.text);

      const rad = (expectedLabels[i]!.deg * Math.PI) / 180;
      const expectedDist = radiusPx - COMPASS_ROSE_LABEL_OFFSET_PX;
      const expectedX = origin.x + expectedDist * Math.sin(rad);
      const expectedY = origin.y - expectedDist * Math.cos(rad);

      expect(geo.labels[i]?.x).toBeCloseTo(expectedX, 5);
      expect(geo.labels[i]?.y).toBeCloseTo(expectedY, 5);
    }
  });

  it("AC4 — accurately computes cardinal points (0° N, 90° E, 180° S, 270° W)", () => {
    const geo = generateCompassRoseGeometry(origin, radiusPx);

    // 0° - North (up: -y)
    const tick0 = geo.ticks.find((t) => t.deg === 0)!;
    expect(tick0.x1).toBeCloseTo(400, 5);
    expect(tick0.y1).toBeCloseTo(400 - radiusPx, 5);
    expect(tick0.x2).toBeCloseTo(400, 5);
    expect(tick0.y2).toBeCloseTo(400 - (radiusPx - COMPASS_ROSE_MAJOR_TICK_PX), 5);

    const label0 = geo.labels.find((l) => l.deg === 0)!;
    expect(label0.text).toBe("360");
    expect(label0.x).toBeCloseTo(400, 5);
    expect(label0.y).toBeCloseTo(400 - (radiusPx - COMPASS_ROSE_LABEL_OFFSET_PX), 5);

    // 90° - East (right: +x)
    const tick90 = geo.ticks.find((t) => t.deg === 90)!;
    expect(tick90.x1).toBeCloseTo(400 + radiusPx, 5);
    expect(tick90.y1).toBeCloseTo(400, 5);
    expect(tick90.x2).toBeCloseTo(400 + (radiusPx - COMPASS_ROSE_MAJOR_TICK_PX), 5);
    expect(tick90.y2).toBeCloseTo(400, 5);

    const label90 = geo.labels.find((l) => l.deg === 90)!;
    expect(label90.text).toBe("090");
    expect(label90.x).toBeCloseTo(400 + (radiusPx - COMPASS_ROSE_LABEL_OFFSET_PX), 5);
    expect(label90.y).toBeCloseTo(400, 5);

    // 180° - South (down: +y)
    const tick180 = geo.ticks.find((t) => t.deg === 180)!;
    expect(tick180.x1).toBeCloseTo(400, 5);
    expect(tick180.y1).toBeCloseTo(400 + radiusPx, 5);
    expect(tick180.x2).toBeCloseTo(400, 5);
    expect(tick180.y2).toBeCloseTo(400 + (radiusPx - COMPASS_ROSE_MAJOR_TICK_PX), 5);

    const label180 = geo.labels.find((l) => l.deg === 180)!;
    expect(label180.text).toBe("180");
    expect(label180.x).toBeCloseTo(400, 5);
    expect(label180.y).toBeCloseTo(400 + (radiusPx - COMPASS_ROSE_LABEL_OFFSET_PX), 5);

    // 270° - West (left: -x)
    const tick270 = geo.ticks.find((t) => t.deg === 270)!;
    expect(tick270.x1).toBeCloseTo(400 - radiusPx, 5);
    expect(tick270.y1).toBeCloseTo(400, 5);
    expect(tick270.x2).toBeCloseTo(400 - (radiusPx - COMPASS_ROSE_MAJOR_TICK_PX), 5);
    expect(tick270.y2).toBeCloseTo(400, 5);

    const label270 = geo.labels.find((l) => l.deg === 270)!;
    expect(label270.text).toBe("270");
    expect(label270.x).toBeCloseTo(400 - (radiusPx - COMPASS_ROSE_LABEL_OFFSET_PX), 5);
    expect(label270.y).toBeCloseTo(400, 5);
  });

  it("handles non-positive radius and optional maxRadiusPx", () => {
    const emptyGeo = generateCompassRoseGeometry(origin, 0);
    expect(emptyGeo.ticks).toHaveLength(0);
    expect(emptyGeo.labels).toHaveLength(0);

    const negativeGeo = generateCompassRoseGeometry(origin, -50);
    expect(negativeGeo.ticks).toHaveLength(0);
    expect(negativeGeo.labels).toHaveLength(0);

    const clampedGeo = generateCompassRoseGeometry(origin, 300, 200);
    expect(clampedGeo.radiusPx).toBe(200);
    expect(clampedGeo.ticks).toHaveLength(72);
  });

  it("formatCompassRoseHeading formats 0 as 360 and pad others to 3 digits", () => {
    expect(formatCompassRoseHeading(0)).toBe("360");
    expect(formatCompassRoseHeading(360)).toBe("360");
    expect(formatCompassRoseHeading(5)).toBe("005");
    expect(formatCompassRoseHeading(30)).toBe("030");
    expect(formatCompassRoseHeading(90)).toBe("090");
    expect(formatCompassRoseHeading(180)).toBe("180");
    expect(formatCompassRoseHeading(270)).toBe("270");
  });
});
