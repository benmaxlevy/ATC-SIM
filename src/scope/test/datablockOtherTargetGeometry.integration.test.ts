import { describe, expect, test } from "vitest";
import {
  protectedGeometryOverlaps,
  resolvedLeaderObstacle,
  solveDatablockLayout,
} from "../datablockLayout";
import { leaderSegmentPx } from "../leader";

describe("datablock other-target geometry", () => {
  test("rejects a segment crossing the rectangle middle", () => {
    expect(
      protectedGeometryOverlaps(
        { x: 10, y: 10, width: 20, height: 20 },
        {
          kind: "segment",
          aircraftId: "B",
          from: { x: 0, y: 20 },
          to: { x: 50, y: 20 },
        },
      ),
    ).toBe(true);
  });

  test("rejects the painted leader segment", () => {
    const s = leaderSegmentPx(8, 36, 10)!;
    expect(
      protectedGeometryOverlaps(
        { x: 0, y: 20, width: 20, height: 20 },
        {
          kind: "segment",
          aircraftId: "B",
          from: { x: 10 + s.x0, y: 40 + s.y0 },
          to: { x: 10 + s.x1, y: 40 + s.y1 },
        },
      ),
    ).toBe(true);
  });

  test("resolved leader becomes an obstacle for later blocks", () => {
    const item = {
      aircraftId: "A",
      targetPoint: { x: 10, y: 50 },
      preferredRect: { x: 40, y: 40, width: 20, height: 20 },
      metrics: { widthPx: 20, heightPx: 20 },
      leaderDir: 6 as const,
      leaderLengthPx: 36,
      displayPriority: "full" as const,
    };
    const leader = resolvedLeaderObstacle(item, { x: 40, y: 40, width: 20, height: 20 })!;
    expect(protectedGeometryOverlaps({ x: 20, y: 48, width: 20, height: 10 }, leader)).toBe(true);
  });

  test("zero-length leader creates no obstacle", () => {
    const item = {
      aircraftId: "A",
      targetPoint: { x: 10, y: 50 },
      preferredRect: { x: 40, y: 40, width: 20, height: 20 },
      metrics: { widthPx: 20, heightPx: 20 },
      leaderDir: 6 as const,
      leaderLengthPx: 0,
      displayPriority: "full" as const,
    };
    expect(resolvedLeaderObstacle(item, { x: 40, y: 40, width: 20, height: 20 })).toBeNull();
  });

  test("current leader cannot cross an accepted datablock", () => {
    const first = {
      aircraftId: "A",
      targetPoint: { x: 10, y: 50 },
      preferredRect: { x: 40, y: 40, width: 20, height: 20 },
      metrics: { widthPx: 20, heightPx: 20 },
      leaderDir: 6 as const,
      leaderLengthPx: 36,
      displayPriority: "full" as const,
    };
    const second = {
      aircraftId: "B",
      targetPoint: { x: 20, y: 50 },
      preferredRect: { x: 70, y: 40, width: 20, height: 20 },
      metrics: { widthPx: 20, heightPx: 20 },
      leaderDir: 6 as const,
      leaderLengthPx: 36,
      displayPriority: "full" as const,
    };
    const layouts = solveDatablockLayout([first, second], {
      bounds: { x: 0, y: 0, width: 120, height: 100 },
    });
    expect(layouts[1]!.rect).not.toMatchObject(second.preferredRect);
  });

  test("rejects polygons containing or crossing a datablock", () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(
      protectedGeometryOverlaps(rect, {
        kind: "polygon",
        aircraftId: "B",
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 50, y: 50 },
          { x: 0, y: 50 },
        ],
      }),
    ).toBe(true);
    expect(
      protectedGeometryOverlaps(rect, {
        kind: "polygon",
        aircraftId: "B",
        points: [
          { x: 0, y: 15 },
          { x: 50, y: 15 },
          { x: 50, y: 18 },
          { x: 0, y: 18 },
        ],
      }),
    ).toBe(true);
  });

  test("moves only the block owned by another target", () => {
    const input = {
      aircraftId: "A",
      targetPoint: { x: 20, y: 20 },
      preferredRect: { x: 20, y: 20, width: 20, height: 20 },
      metrics: { widthPx: 20, heightPx: 20 },
      leaderDir: 8 as const,
      leaderLengthPx: 36,
      displayPriority: "full" as const,
    };
    const obstacle = {
      kind: "circle" as const,
      aircraftId: "B",
      center: { x: 30, y: 30 },
      radius: 20,
    };
    expect(
      solveDatablockLayout([input], {
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        protectedGeometry: [obstacle],
      })[0]!.rect,
    ).not.toMatchObject({ x: 20, y: 20 });
    expect(
      solveDatablockLayout([input], {
        bounds: { x: 0, y: 0, width: 100, height: 100 },
        protectedGeometry: [{ ...obstacle, aircraftId: "A" }],
      })[0]!.rect,
    ).toMatchObject({ x: 20, y: 20 });
  });
});
