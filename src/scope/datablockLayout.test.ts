import { describe, expect, test } from "vitest";
import {
  datablockRectsOverlap,
  protectedGeometryOverlaps,
  solveDatablockLayout,
  type DatablockLayoutInput,
} from "./datablockLayout";

const bounds = { x: 0, y: 0, width: 240, height: 160 };
const base = (
  aircraftId: string,
  x: number,
  y: number,
  selected = false,
): DatablockLayoutInput => ({
  aircraftId,
  targetPoint: { x, y },
  preferredRect: { x, y, width: 40, height: 20, w: 40, h: 20 },
  metrics: { widthPx: 40, heightPx: 20 },
  leaderDir: 8,
  leaderLengthPx: 36,
  displayPriority: "full",
  selected,
});

describe("datablock layout", () => {
  test("keeps one preferred rectangle and allows edge touch", () => {
    const result = solveDatablockLayout([base("A", 20, 20)], { bounds });
    expect(result[0].rect).toMatchObject({ x: 20, y: 20, width: 40, height: 20 });
    expect(
      datablockRectsOverlap(result[0].rect!, { x: 60, y: 20, width: 40, height: 20, w: 40, h: 20 }),
    ).toBe(false);
  });

  test("keeps selected preferred placement and separates collision", () => {
    const result = solveDatablockLayout([base("B", 40, 40), base("A", 40, 40, true)], { bounds });
    const selected = result.find((item) => item.aircraftId === "A")!;
    const other = result.find((item) => item.aircraftId === "B")!;
    expect(selected.rect).toMatchObject({ x: 40, y: 40 });
    expect(datablockRectsOverlap(selected.rect!, other.rect!)).toBe(false);
  });

  test("is stable for reversed input order and priority", () => {
    const low = { ...base("LDB", 40, 40), displayPriority: "limited" as const };
    const middle = { ...base("PDB", 40, 40), displayPriority: "partial" as const };
    const high = { ...base("FDB", 40, 40), displayPriority: "full" as const };
    const a = solveDatablockLayout([low, middle, high], { bounds });
    const b = solveDatablockLayout([high, low, middle], { bounds });
    const byId = (items: typeof a) => new Map(items.map((item) => [item.aircraftId, item]));
    for (const id of ["FDB", "PDB", "LDB"]) expect(byId(b).get(id)).toEqual(byId(a).get(id));
    expect(byId(a).get("FDB")?.rect).toMatchObject({ x: 40, y: 40 });
    expect(byId(a).get("PDB")?.rect).not.toEqual(byId(a).get("FDB")?.rect);
    expect(byId(a).get("LDB")?.rect).not.toEqual(byId(a).get("PDB")?.rect);
  });

  test("resolves six colliding tracks to pairwise distinct in-bounds rectangles", () => {
    const items = Array.from({ length: 6 }, (_, index) => base(`T${index}`, 100, 80));
    const result = solveDatablockLayout(items, { bounds, gridStepPx: 4 });
    const placed = result.flatMap((item) => (item.rect ? [item.rect] : []));
    expect(placed).toHaveLength(6);
    for (const rect of placed) {
      expect(rect.x).toBeGreaterThanOrEqual(bounds.x);
      expect(rect.y).toBeGreaterThanOrEqual(bounds.y);
      expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(bounds.y + bounds.height);
    }
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1)
        expect(datablockRectsOverlap(placed[i], placed[j])).toBe(false);
    }
  });

  test("returns unplaced when capacity is exhausted", () => {
    const result = solveDatablockLayout([base("A", 0, 0), base("B", 0, 0)], {
      bounds: { x: 0, y: 0, width: 40, height: 20 },
      gridStepPx: 1,
    });
    expect(result.find((item) => item.aircraftId === "A")?.unplaced).toBe(false);
    expect(result.find((item) => item.aircraftId === "B")?.unplaced).toBe(true);
  });

  test("avoids other-target geometry while exempting own geometry", () => {
    const item = base("A", 20, 20);
    const obstacle = {
      kind: "circle" as const,
      aircraftId: "B",
      center: { x: 40, y: 30 },
      radius: 16,
    };
    const own = { ...obstacle, aircraftId: "A" };
    expect(protectedGeometryOverlaps({ x: 20, y: 20, width: 40, height: 20 }, obstacle)).toBe(true);
    expect(protectedGeometryOverlaps({ x: 20, y: 20, width: 40, height: 20 }, own)).toBe(true);
    const result = solveDatablockLayout([item], { bounds, protectedGeometry: [obstacle] });
    expect(result[0]!.rect).not.toMatchObject({ x: 20, y: 20 });
    expect(
      solveDatablockLayout([item], { bounds, protectedGeometry: [own] })[0]!.rect,
    ).toMatchObject({ x: 20, y: 20 });
  });

  test("uses 1 px clearance around segments and polygons", () => {
    const rect = { x: 20, y: 20, width: 40, height: 20 };
    expect(
      protectedGeometryOverlaps(rect, {
        kind: "segment",
        aircraftId: "B",
        from: { x: 0, y: 19 },
        to: { x: 100, y: 19 },
      }),
    ).toBe(true);
    expect(
      protectedGeometryOverlaps(rect, {
        kind: "polygon",
        aircraftId: "B",
        points: [
          { x: 25, y: 25 },
          { x: 30, y: 25 },
          { x: 30, y: 30 },
        ],
      }),
    ).toBe(true);
  });
});
