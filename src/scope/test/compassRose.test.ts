import { describe, expect, it } from "vitest";
import {
  COMPASS_ROSE_LABEL_OFFSET_PX,
  COMPASS_ROSE_MAJOR_TICK_PX,
  COMPASS_ROSE_MEDIUM_TICK_PX,
  COMPASS_ROSE_MINOR_TICK_PX,
  COMPASS_ROSE_TICK_INTERVAL_DEG,
  formatCompassRoseHeading,
  generateCompassRoseGeometry,
  normalizeCompassRoseBounds,
} from "../compassRose";

describe("Compass Rose geometry generator on rectangular border", () => {
  const origin = { x: 400, y: 400 };
  const viewSize = { widthPx: 800, heightPx: 800 };
  const expectedBounds = { minX: 1, minY: 1, maxX: 799, maxY: 799 };

  it("AC1 — generates exactly 72 ticks at 5-degree intervals from 0° to 355° on rectangular border", () => {
    const geo = generateCompassRoseGeometry(origin, viewSize);
    expect(geo.origin).toEqual(origin);
    expect(geo.bounds).toEqual(expectedBounds);
    expect(geo.ticks).toHaveLength(72);

    for (let i = 0; i < 72; i += 1) {
      const expectedDeg = i * 5;
      expect(geo.ticks[i]?.deg).toBe(expectedDeg);
    }
  });

  it("AC1 — partitions ticks into 36 major (10°) and 36 minor (5°) ticks with exact lengths", () => {
    const geo = generateCompassRoseGeometry(origin, viewSize);
    const major = geo.ticks.filter((t) => t.kind === "major");
    const minor = geo.ticks.filter((t) => t.kind === "minor");

    expect(major).toHaveLength(36);
    expect(minor).toHaveLength(36);

    for (const tick of major) {
      expect(tick.deg % 10).toBe(0);
      const len = Math.hypot(tick.x1 - tick.x2, tick.y1 - tick.y2);
      expect(len).toBeCloseTo(COMPASS_ROSE_MAJOR_TICK_PX, 5);
    }

    for (const tick of minor) {
      expect(tick.deg % 10).not.toBe(0);
      expect(tick.deg % 5).toBe(0);
      const len = Math.hypot(tick.x1 - tick.x2, tick.y1 - tick.y2);
      expect(len).toBeCloseTo(COMPASS_ROSE_MINOR_TICK_PX, 5);
    }
  });

  it("AC1 — generates 36 3-digit heading labels radially offset inward by 30px from rectangular border", () => {
    const geo = generateCompassRoseGeometry(origin, viewSize);
    expect(geo.labels).toHaveLength(36);

    for (let i = 0; i < 36; i += 1) {
      const expectedDeg = i * 10;
      expect(geo.labels[i]?.deg).toBe(expectedDeg);
      expect(geo.labels[i]?.text).toBe(formatCompassRoseHeading(expectedDeg));

      const tick = geo.ticks.find((t) => t.deg === expectedDeg)!;
      const rad = (expectedDeg * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);

      expect(geo.labels[i]?.x).toBeCloseTo(tick.x1 - COMPASS_ROSE_LABEL_OFFSET_PX * dx, 5);
      expect(geo.labels[i]?.y).toBeCloseTo(tick.y1 - COMPASS_ROSE_LABEL_OFFSET_PX * dy, 5);
    }
  });

  it("AC4 — accurately computes cardinal points (0° N, 90° E, 180° S, 270° W) on rectangular border", () => {
    const geo = generateCompassRoseGeometry(origin, viewSize);

    // 0° - North (top edge: y = 1, x = 400)
    const tick0 = geo.ticks.find((t) => t.deg === 0)!;
    expect(tick0.x1).toBeCloseTo(400, 5);
    expect(tick0.y1).toBeCloseTo(1, 5);
    expect(tick0.x2).toBeCloseTo(400, 5);
    expect(tick0.y2).toBeCloseTo(1 + COMPASS_ROSE_MAJOR_TICK_PX, 5);

    const label0 = geo.labels.find((l) => l.deg === 0)!;
    expect(label0.text).toBe("360");
    expect(label0.x).toBeCloseTo(400, 5);
    expect(label0.y).toBeCloseTo(1 + COMPASS_ROSE_LABEL_OFFSET_PX, 5);

    // 90° - East (right edge: x = 799, y = 400)
    const tick90 = geo.ticks.find((t) => t.deg === 90)!;
    expect(tick90.x1).toBeCloseTo(799, 5);
    expect(tick90.y1).toBeCloseTo(400, 5);
    expect(tick90.x2).toBeCloseTo(799 - COMPASS_ROSE_MAJOR_TICK_PX, 5);
    expect(tick90.y2).toBeCloseTo(400, 5);

    const label90 = geo.labels.find((l) => l.deg === 90)!;
    expect(label90.text).toBe("090");
    expect(label90.x).toBeCloseTo(799 - COMPASS_ROSE_LABEL_OFFSET_PX, 5);
    expect(label90.y).toBeCloseTo(400, 5);

    // 180° - South (bottom edge: y = 799, x = 400)
    const tick180 = geo.ticks.find((t) => t.deg === 180)!;
    expect(tick180.x1).toBeCloseTo(400, 5);
    expect(tick180.y1).toBeCloseTo(799, 5);
    expect(tick180.x2).toBeCloseTo(400, 5);
    expect(tick180.y2).toBeCloseTo(799 - COMPASS_ROSE_MAJOR_TICK_PX, 5);

    const label180 = geo.labels.find((l) => l.deg === 180)!;
    expect(label180.text).toBe("180");
    expect(label180.x).toBeCloseTo(400, 5);
    expect(label180.y).toBeCloseTo(799 - COMPASS_ROSE_LABEL_OFFSET_PX, 5);

    // 270° - West (left edge: x = 1, y = 400)
    const tick270 = geo.ticks.find((t) => t.deg === 270)!;
    expect(tick270.x1).toBeCloseTo(1, 5);
    expect(tick270.y1).toBeCloseTo(400, 5);
    expect(tick270.x2).toBeCloseTo(1 + COMPASS_ROSE_MAJOR_TICK_PX, 5);
    expect(tick270.y2).toBeCloseTo(400, 5);

    const label270 = geo.labels.find((l) => l.deg === 270)!;
    expect(label270.text).toBe("270");
    expect(label270.x).toBeCloseTo(1 + COMPASS_ROSE_LABEL_OFFSET_PX, 5);
    expect(label270.y).toBeCloseTo(400, 5);
  });

  it("handles non-square viewport bounds and explicit CompassRoseRectBounds input", () => {
    const nonSquareOrigin = { x: 500, y: 300 };
    const nonSquareSize = { widthPx: 1000, heightPx: 600 };
    const geo = generateCompassRoseGeometry(nonSquareOrigin, nonSquareSize);

    expect(geo.bounds).toEqual({ minX: 1, minY: 1, maxX: 999, maxY: 599 });
    expect(geo.ticks).toHaveLength(72);

    // North (top edge: y = 1, x = 500)
    const tick0 = geo.ticks.find((t) => t.deg === 0)!;
    expect(tick0.x1).toBeCloseTo(500, 5);
    expect(tick0.y1).toBeCloseTo(1, 5);

    // East (right edge: x = 999, y = 300)
    const tick90 = geo.ticks.find((t) => t.deg === 90)!;
    expect(tick90.x1).toBeCloseTo(999, 5);
    expect(tick90.y1).toBeCloseTo(300, 5);

    // South (bottom edge: y = 599, x = 500)
    const tick180 = geo.ticks.find((t) => t.deg === 180)!;
    expect(tick180.x1).toBeCloseTo(500, 5);
    expect(tick180.y1).toBeCloseTo(599, 5);

    // West (left edge: x = 1, y = 300)
    const tick270 = geo.ticks.find((t) => t.deg === 270)!;
    expect(tick270.x1).toBeCloseTo(1, 5);
    expect(tick270.y1).toBeCloseTo(300, 5);

    // Explicit bounds
    const explicitGeo = generateCompassRoseGeometry({ x: 250, y: 200 }, {
      minX: 10,
      minY: 20,
      maxX: 500,
      maxY: 400,
    });
    expect(explicitGeo.bounds).toEqual({ minX: 10, minY: 20, maxX: 500, maxY: 400 });
    expect(explicitGeo.ticks).toHaveLength(72);
  });

  it("handles ray-box intersections correctly with off-center origin", () => {
    const offCenterOrigin = { x: 200, y: 600 };
    const geo = generateCompassRoseGeometry(offCenterOrigin, viewSize);

    // North ray from (200, 600) hits top edge at (200, 1)
    const tick0 = geo.ticks.find((t) => t.deg === 0)!;
    expect(tick0.x1).toBeCloseTo(200, 5);
    expect(tick0.y1).toBeCloseTo(1, 5);

    // East ray from (200, 600) hits right edge at (799, 600)
    const tick90 = geo.ticks.find((t) => t.deg === 90)!;
    expect(tick90.x1).toBeCloseTo(799, 5);
    expect(tick90.y1).toBeCloseTo(600, 5);

    // South ray from (200, 600) hits bottom edge at (200, 799)
    const tick180 = geo.ticks.find((t) => t.deg === 180)!;
    expect(tick180.x1).toBeCloseTo(200, 5);
    expect(tick180.y1).toBeCloseTo(799, 5);

    // West ray from (200, 600) hits left edge at (1, 600)
    const tick270 = geo.ticks.find((t) => t.deg === 270)!;
    expect(tick270.x1).toBeCloseTo(1, 5);
    expect(tick270.y1).toBeCloseTo(600, 5);
  });

  it("handles degenerate and invalid bounds gracefully", () => {
    const emptyGeo = generateCompassRoseGeometry(origin, { widthPx: 0, heightPx: 0 });
    expect(emptyGeo.ticks).toHaveLength(0);
    expect(emptyGeo.labels).toHaveLength(0);

    const smallGeo = generateCompassRoseGeometry(origin, { widthPx: 2, heightPx: 2 });
    expect(smallGeo.ticks).toHaveLength(0);
    expect(smallGeo.labels).toHaveLength(0);

    const invertedGeo = generateCompassRoseGeometry(origin, { minX: 100, minY: 100, maxX: 50, maxY: 50 });
    expect(invertedGeo.ticks).toHaveLength(0);
    expect(invertedGeo.labels).toHaveLength(0);
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

  it("normalizeCompassRoseBounds insets widthPx/heightPx by 1px", () => {
    expect(normalizeCompassRoseBounds({ widthPx: 800, heightPx: 600 })).toEqual({
      minX: 1,
      minY: 1,
      maxX: 799,
      maxY: 599,
    });
    expect(normalizeCompassRoseBounds({ minX: 10, minY: 20, maxX: 100, maxY: 200 })).toEqual({
      minX: 10,
      minY: 20,
      maxX: 100,
      maxY: 200,
    });
  });
});
