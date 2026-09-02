import { describe, expect, test } from "vitest";
import { createWorld } from "@core";
import {
  createScopeView,
  generateCompassRoseGeometry,
  formatCompassRoseHeading,
  COMPASS_ROSE_TICK_INTERVAL_DEG,
  COMPASS_ROSE_MINOR_TICK_PX,
  COMPASS_ROSE_MAJOR_TICK_PX,
  COMPASS_ROSE_LABEL_OFFSET_PX,
  toggleMapLayer,
  renderScope,
  serializeDcbPref,
  applyDcbPref,
  saveDcbPref,
  loadDcbPrefFromStorage,
  stepBriteChannel,
  formatDcbBriteReadout,
  PALETTE,
  applyBrite,
  datablockFontCss,
  type DcbPrefStorage,
  type DigitalMap,
} from "@scope";
import { createMockCtx } from "./mockCanvas";

function memoryStorage(): DcbPrefStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem(key) {
      return data.get(key) ?? null;
    },
    setItem(key, value) {
      data.set(key, value);
    },
  };
}

const KDEM_DIGITAL_MAP: DigitalMap = {
  runway: {
    id: "27",
    thresholdEastNm: 0,
    thresholdNorthNm: 0,
    headingTrueDeg: 270,
    lengthNm: 2,
    widthNm: 0.1,
  },
  localizer: {
    runwayId: "27",
    courseTrueDeg: 270,
    featherLengthNm: 15,
    halfWidthDeg: 3,
  },
  rangeRings: {
    intervalNm: 5,
    maxNm: 60,
  },
};

const HEADING_LABELS = Array.from({ length: 36 }, (_, i) => formatCompassRoseHeading(i * 10));

describe("T02-89 Compass Rose Integration and Acceptance Suite", () => {
  test("AC1 — Compass Rose geometry generation: 72 ticks, partition kinds, offsets, and 36 3-digit heading labels", () => {
    const origin = { x: 500, y: 500 };
    const viewSize = { widthPx: 1000, heightPx: 1000 };
    const expectedBounds = { minX: 1, minY: 1, maxX: 999, maxY: 999 };

    const geo = generateCompassRoseGeometry(origin, viewSize);
    expect(geo.origin).toEqual(origin);
    expect(geo.bounds).toEqual(expectedBounds);
    expect(geo.ticks).toHaveLength(72);
    expect(geo.labels).toHaveLength(36);

    // Verify 5-degree interval from 0 to 355
    geo.ticks.forEach((tick, idx) => {
      const expectedDeg = idx * COMPASS_ROSE_TICK_INTERVAL_DEG;
      expect(tick.deg).toBe(expectedDeg);
    });

    const majorTicks = geo.ticks.filter((t) => t.kind === "major");
    const minorTicks = geo.ticks.filter((t) => t.kind === "minor");

    expect(majorTicks).toHaveLength(36); // Every 10°
    expect(minorTicks).toHaveLength(36); // Every 5° not 10°

    // Verify lengths of all tick kinds
    for (const tick of majorTicks) {
      expect(tick.deg % 10).toBe(0);
      const len = Math.hypot(tick.x1 - tick.x2, tick.y1 - tick.y2);
      expect(len).toBeCloseTo(COMPASS_ROSE_MAJOR_TICK_PX, 5);
    }
    for (const tick of minorTicks) {
      expect(tick.deg % 10).not.toBe(0);
      expect(tick.deg % 5).toBe(0);
      const len = Math.hypot(tick.x1 - tick.x2, tick.y1 - tick.y2);
      expect(len).toBeCloseTo(COMPASS_ROSE_MINOR_TICK_PX, 5);
    }

    // Verify 36 3-digit labels positioned inward by COMPASS_ROSE_LABEL_OFFSET_PX
    expect(geo.labels.map((l) => l.text)).toEqual(HEADING_LABELS);
    for (let i = 0; i < 36; i += 1) {
      const label = geo.labels[i]!;
      const expectedDeg = i * 10;
      expect(label.deg).toBe(expectedDeg);
      expect(label.text).toBe(formatCompassRoseHeading(expectedDeg));

      const tick = geo.ticks.find((t) => t.deg === expectedDeg)!;
      const rad = (expectedDeg * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      expect(label.x).toBeCloseTo(tick.x1 - COMPASS_ROSE_LABEL_OFFSET_PX * dx, 5);
      expect(label.y).toBeCloseTo(tick.y1 - COMPASS_ROSE_LABEL_OFFSET_PX * dy, 5);
    }

    // Verify North, East, South, West cardinal alignments
    const northTick = geo.ticks.find((t) => t.deg === 0)!;
    expect(northTick.x1).toBeCloseTo(500, 5);
    expect(northTick.y1).toBeCloseTo(1, 5);
    expect(northTick.x2).toBeCloseTo(500, 5);
    expect(northTick.y2).toBeCloseTo(1 + COMPASS_ROSE_MAJOR_TICK_PX, 5);

    const eastTick = geo.ticks.find((t) => t.deg === 90)!;
    expect(eastTick.x1).toBeCloseTo(999, 5);
    expect(eastTick.y1).toBeCloseTo(500, 5);
    expect(eastTick.x2).toBeCloseTo(999 - COMPASS_ROSE_MAJOR_TICK_PX, 5);
    expect(eastTick.y2).toBeCloseTo(500, 5);

    const southTick = geo.ticks.find((t) => t.deg === 180)!;
    expect(southTick.x1).toBeCloseTo(500, 5);
    expect(southTick.y1).toBeCloseTo(999, 5);
    expect(southTick.x2).toBeCloseTo(500, 5);
    expect(southTick.y2).toBeCloseTo(999 - COMPASS_ROSE_MAJOR_TICK_PX, 5);

    const westTick = geo.ticks.find((t) => t.deg === 270)!;
    expect(westTick.x1).toBeCloseTo(1, 5);
    expect(westTick.y1).toBeCloseTo(500, 5);
    expect(westTick.x2).toBeCloseTo(1 + COMPASS_ROSE_MAJOR_TICK_PX, 5);
    expect(westTick.y2).toBeCloseTo(500, 5);
  });

  test("AC2 — MapCache integration and rendering: compass rose builds and updates with camera/range/origin/layer changes", () => {
    const view = createScopeView(0, 0, { digitalMap: KDEM_DIGITAL_MAP });
    expect(view.showCompassRose).toBe(true);
    expect(view.showRings).toBe(true);

    const world = createWorld();
    const mockCtx1 = createMockCtx();
    renderScope(mockCtx1.ctx, world, view, 800, 800);

    const cache1 = view.mapCache;
    expect(cache1).not.toBeNull();
    expect(cache1?.compassRose).not.toBeNull();
    expect(cache1?.compassRose?.ticks).toHaveLength(72);
    expect(cache1?.compassRose?.labels).toHaveLength(36);
    expect(cache1?.compassRoseLabels).toHaveLength(36);

    // Verify labels and ticks painted on canvas
    const renderedLabels1 = mockCtx1.fillTexts.filter(
      (t) => t.textBaseline === "middle" && HEADING_LABELS.includes(t.text),
    );
    expect(renderedLabels1).toHaveLength(36);

    // Dynamic Range preset change (e.g. 20 NM -> 40 NM) rebuilds cache and scales compass rose radius
    view.camera.rangeNm = 40;
    const mockCtx2 = createMockCtx();
    renderScope(mockCtx2.ctx, world, view, 800, 800);
    const cache2 = view.mapCache;
    expect(cache2).not.toBe(cache1);
    expect(cache2?.compassRose).not.toBeNull();
    expect(cache2?.compassRose?.ticks).toHaveLength(72);

    // Range ring center move: compass rose remains fixed to scope center
    view.rangeRingEastNm = 10;
    view.rangeRingNorthNm = 5;
    const mockCtx3 = createMockCtx();
    renderScope(mockCtx3.ctx, world, view, 800, 800);
    const cache3 = view.mapCache;
    expect(cache3).not.toBe(cache2);
    expect(cache3?.compassRose?.origin.x).toBeCloseTo(400, 5);
    expect(cache3?.compassRose?.origin.y).toBeCloseTo(400, 5);
    expect(cache3?.compassRose?.origin.x).toBeCloseTo(cache2!.compassRose!.origin.x, 5);

    // Layer toggle: turning off showCompassRose suppresses geometry and rendering
    toggleMapLayer(view, "compassRose");
    expect(view.showCompassRose).toBe(false);
    const mockCtx4 = createMockCtx();
    renderScope(mockCtx4.ctx, world, view, 800, 800);
    expect(view.mapCache?.compassRose).toBeNull();
    expect(view.mapCache?.compassRoseLabels).toHaveLength(0);
    const renderedLabels4 = mockCtx4.fillTexts.filter(
      (t) => t.textBaseline === "middle" && HEADING_LABELS.includes(t.text),
    );
    expect(renderedLabels4).toHaveLength(0);

    // Turning showCompassRose back on restores geometry and rendering
    toggleMapLayer(view, "compassRose");
    expect(view.showCompassRose).toBe(true);
    const mockCtx5 = createMockCtx();
    renderScope(mockCtx5.ctx, world, view, 800, 800);
    expect(view.mapCache?.compassRose).not.toBeNull();
    expect(view.mapCache?.compassRoseLabels).toHaveLength(36);

    // Turning off showRings also suppresses compass rose (rose attaches to range rings)
    toggleMapLayer(view, "rings");
    expect(view.showRings).toBe(false);
    const mockCtx6 = createMockCtx();
    renderScope(mockCtx6.ctx, world, view, 800, 800);
    expect(view.mapCache?.compassRose).toBeNull();
    expect(view.mapCache?.compassRoseLabels).toHaveLength(0);
  });

  test("AC3 — BRITE CMP modulation (from 0% / OFF to 100%) and CHAR SIZE TOOLS font sizing", () => {
    const view = createScopeView(0, 0, { digitalMap: KDEM_DIGITAL_MAP });
    const world = createWorld();

    // Default BRITE CMP is 100
    expect(view.brite.cmp).toBe(100);
    expect(formatDcbBriteReadout(view.brite.cmp)).toBe("100");

    // Modulate to 50% via stepBriteChannel
    stepBriteChannel(view, "cmp", -5);
    expect(view.brite.cmp).toBe(50);
    expect(formatDcbBriteReadout(view.brite.cmp)).toBe("50");

    const mockCtx50 = createMockCtx();
    renderScope(mockCtx50.ctx, world, view, 800, 800);
    const cmpColor50 = applyBrite(PALETTE.mapDim, 50);
    const labels50 = mockCtx50.fillTexts.filter(
      (t) => t.textBaseline === "middle" && HEADING_LABELS.includes(t.text),
    );
    expect(labels50).toHaveLength(36);
    for (const label of labels50) {
      expect(label.fillStyle).toBe(cmpColor50);
    }
    const tickStroke50 = mockCtx50.pathStrokes.find(
      (s) => s.strokeStyle === cmpColor50 && s.lineWidth === 1,
    );
    expect(tickStroke50).toBeDefined();

    // Modulate to 0% (OFF)
    stepBriteChannel(view, "cmp", -10);
    expect(view.brite.cmp).toBe(0);
    expect(formatDcbBriteReadout(view.brite.cmp)).toBe("OFF");

    const mockCtx0 = createMockCtx();
    renderScope(mockCtx0.ctx, world, view, 800, 800);
    const cmpColor0 = applyBrite(PALETTE.mapDim, 0);
    const labels0 = mockCtx0.fillTexts.filter(
      (t) => t.textBaseline === "middle" && HEADING_LABELS.includes(t.text),
    );
    expect(labels0).toHaveLength(36);
    for (const label of labels0) {
      expect(label.fillStyle).toBe(cmpColor0);
    }

    // Step back up to 100%
    stepBriteChannel(view, "cmp", 10);
    expect(view.brite.cmp).toBe(100);
    expect(formatDcbBriteReadout(view.brite.cmp)).toBe("100");

    // Test CHAR SIZE TOOLS modulation
    view.charSizes.tools = 11;
    const mockCtxFont11 = createMockCtx();
    renderScope(mockCtxFont11.ctx, world, view, 800, 800);
    const labelsFont11 = mockCtxFont11.fillTexts.filter(
      (t) => t.textBaseline === "middle" && HEADING_LABELS.includes(t.text),
    );
    expect(labelsFont11).toHaveLength(36);
    for (const label of labelsFont11) {
      expect(label.font).toBe(datablockFontCss(11));
    }

    view.charSizes.tools = 13;
    const mockCtxFont13 = createMockCtx();
    renderScope(mockCtxFont13.ctx, world, view, 800, 800);
    const labelsFont13 = mockCtxFont13.fillTexts.filter(
      (t) => t.textBaseline === "middle" && HEADING_LABELS.includes(t.text),
    );
    expect(labelsFont13).toHaveLength(36);
    for (const label of labelsFont13) {
      expect(label.font).toBe(datablockFontCss(13));
    }
  });

  test("AC4 — PREF serialization and storage round-trip preserves showCompassRose and brite.cmp", () => {
    const storage = memoryStorage();
    const icao = "KDEM";
    const view1 = createScopeView(0, 0, { digitalMap: KDEM_DIGITAL_MAP });
    view1.dcbPref.icao = icao;

    // Mutate state away from defaults
    view1.showCompassRose = false;
    view1.brite.cmp = 30;
    view1.charSizes.tools = 13;

    // Serialize
    const serialized = serializeDcbPref(view1);
    expect(serialized.showCompassRose).toBe(false);
    expect(serialized.brite.cmp).toBe(30);
    expect(serialized.charSizes.tools).toBe(13);

    // Save to PREF slot 0 in storage
    saveDcbPref(view1, storage);

    // Create fresh ScopeView and restore from storage (loads slot 0)
    const view2 = createScopeView(0, 0, { digitalMap: KDEM_DIGITAL_MAP });
    expect(view2.showCompassRose).toBe(true);
    expect(view2.brite.cmp).toBe(100);
    expect(view2.charSizes.tools).toBe(12);

    loadDcbPrefFromStorage(view2, icao, storage);

    expect(view2.showCompassRose).toBe(false);
    expect(view2.brite.cmp).toBe(30);
    expect(view2.charSizes.tools).toBe(13);

    // Mutate view2 to showCompassRose=true, brite.cmp=80, save to slot 1
    view2.showCompassRose = true;
    view2.brite.cmp = 80;
    view2.dcbPref.activeIndex = 1;
    saveDcbPref(view2, storage);

    // Create fresh ScopeView and verify slot 1 is loaded when activeIndex is 1
    const view3 = createScopeView(0, 0, { digitalMap: KDEM_DIGITAL_MAP });
    loadDcbPrefFromStorage(view3, icao, storage);
    expect(view3.dcbPref.activeIndex).toBe(1);
    expect(view3.showCompassRose).toBe(true);
    expect(view3.brite.cmp).toBe(80);

    // Switch back to slot 0 and verify slot 0 values
    const slot0 = view3.dcbPref.slots[0];
    expect(slot0).not.toBeNull();
    applyDcbPref(view3, slot0!.body);
    expect(view3.showCompassRose).toBe(false);
    expect(view3.brite.cmp).toBe(30);
  });
});
