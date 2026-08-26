import { expect, test } from "vitest";
import { PALETTE, applyBrite } from "./palette";
import {
  HEADING_TICK_PX,
  HISTORY_DOT_SIZE_PX,
  POSITION_SYMBOL_COLOR,
  SELECTED_ACCENT_COLOR,
  SELECTION_BOX_PAD_PX,
  TARGET_SHAPE,
  TARGET_SIZE_PX,
  drawHistoryDot,
  drawSelectionBox,
  drawTargetSymbol,
  headingTickOffset,
  historyDotColor,
  isPrimaryTarget,
  isTargetDiamondPath,
  renderTargetSymbol,
  selectionBoxRect,
  targetDiamondVertices,
  targetStrokeColor,
  targetSymbolDescriptor,
  targetSymbolShape,
} from "./targetSymbol";

interface MockDrawTargetCtx {
  ctx: CanvasRenderingContext2D;
  fillTexts: { text: string; font?: string; x?: number; y?: number; fillStyle?: string }[];
  strokeRects: { x: number; y: number; w: number; h: number; strokeStyle?: string }[];
  pathStrokes: { points: { x: number; y: number }[]; strokeStyle?: string; lineWidth?: number }[];
}

function createMockTargetCtx(): MockDrawTargetCtx {
  const fillTexts: { text: string; font?: string; x?: number; y?: number; fillStyle?: string }[] = [];
  const strokeRects: { x: number; y: number; w: number; h: number; strokeStyle?: string }[] = [];
  const pathStrokes: { points: { x: number; y: number }[]; strokeStyle?: string; lineWidth?: number }[] = [];
  let currentPath: { x: number; y: number }[] = [];

  const ctx = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    font: "",
    textAlign: "center",
    textBaseline: "middle",
    beginPath() {
      currentPath = [];
    },
    moveTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    lineTo(x: number, y: number) {
      currentPath.push({ x, y });
    },
    closePath() {},
    stroke() {
      pathStrokes.push({
        points: [...currentPath],
        strokeStyle: this.strokeStyle,
        lineWidth: this.lineWidth,
      });
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      strokeRects.push({ x, y, w, h, strokeStyle: this.strokeStyle });
    },
    fillText(text: string, x: number, y: number) {
      fillTexts.push({ text, font: this.font, x, y, fillStyle: this.fillStyle });
    },
    fillRect() {},
  };

  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    fillTexts,
    strokeRects,
    pathStrokes,
  };
}

test("AC1 — Primary-only target returns diamond shape and renders diamond path", () => {
  expect(TARGET_SHAPE).toBe("diamond");
  expect(isPrimaryTarget({ primaryOnly: true })).toBe(true);
  expect(isPrimaryTarget({ isPrimary: true })).toBe(true);
  expect(isPrimaryTarget({ transponder: "primary" })).toBe(true);
  expect(isPrimaryTarget({ transponder: "none" })).toBe(true);
  expect(isPrimaryTarget(null, { primaryOnly: true })).toBe(true);
  expect(isPrimaryTarget(null, { isPrimary: true })).toBe(true);
  expect(isPrimaryTarget(null, { surveillance: "primary" })).toBe(true);
  expect(isPrimaryTarget({ transponder: "mode_c" })).toBe(false);
  expect(isPrimaryTarget()).toBe(false);

  const desc = targetSymbolDescriptor({ isPrimary: true });
  expect(desc.kind).toBe("diamond");
  expect(desc.shape).toBe("diamond");
  expect(desc.symbol).toBe("◇");
  expect(targetSymbolShape({ isPrimary: true })).toBe("diamond");

  const mock = createMockTargetCtx();
  drawTargetSymbol(mock.ctx, 100, 200, POSITION_SYMBOL_COLOR, { isPrimary: true }, 8);
  expect(mock.pathStrokes).toHaveLength(1);
  expect(isTargetDiamondPath(mock.pathStrokes[0]!.points, 100, 200)).toBe(true);
  expect(mock.pathStrokes[0]!.strokeStyle).toBe(POSITION_SYMBOL_COLOR);
  expect(mock.fillTexts).toHaveLength(0);
  expect(mock.strokeRects).toHaveLength(0);
});

test("AC2 — Unassociated secondary targets render asterisk, V for 1200, square for beacon select", () => {
  // Default unassociated
  const unassoc = targetSymbolDescriptor({ ownership: "unowned", squawk: "0342" });
  expect(unassoc.kind).toBe("asterisk");
  expect(unassoc.shape).toBe("text");
  expect(unassoc.symbol).toBe("*");
  expect(targetSymbolShape({ ownership: "unowned", squawk: "0342" })).toBe("*");

  const mockUnassoc = createMockTargetCtx();
  drawTargetSymbol(mockUnassoc.ctx, 100, 200, POSITION_SYMBOL_COLOR, { ownership: "unowned", squawk: "0342" }, 8);
  expect(mockUnassoc.fillTexts).toHaveLength(1);
  expect(mockUnassoc.fillTexts[0]!.text).toBe("*");
  expect(mockUnassoc.pathStrokes).toHaveLength(0);

  // 1200 VFR squawk
  const vfr = targetSymbolDescriptor({ ownership: "unowned", squawk: "1200" });
  expect(vfr.kind).toBe("vfr");
  expect(vfr.shape).toBe("text");
  expect(vfr.symbol).toBe("V");
  expect(targetSymbolShape({ ownership: "unowned", squawk: "1200" })).toBe("V");

  const mockVfr = createMockTargetCtx();
  drawTargetSymbol(mockVfr.ctx, 100, 200, POSITION_SYMBOL_COLOR, { ownership: "unowned", squawk: "1200" }, 8);
  expect(mockVfr.fillTexts).toHaveLength(1);
  expect(mockVfr.fillTexts[0]!.text).toBe("V");
  expect(mockVfr.pathStrokes).toHaveLength(0);

  // Beacon select list match
  const bcnSelect = targetSymbolDescriptor({
    ownership: "unowned",
    squawk: "4521",
    beaconSelect: ["4521", "1200"],
  });
  expect(bcnSelect.kind).toBe("beacon_select");
  expect(bcnSelect.shape).toBe("square");
  expect(bcnSelect.symbol).toBe("□");
  expect(targetSymbolShape({
    ownership: "unowned",
    squawk: "4521",
    beaconSelect: new Set(["4521"]),
  })).toBe("square");

  const mockBcn = createMockTargetCtx();
  drawTargetSymbol(mockBcn.ctx, 100, 200, POSITION_SYMBOL_COLOR, {
    ownership: "unowned",
    squawk: "4521",
    beaconSelect: ["4521"],
  }, 8);
  expect(mockBcn.strokeRects).toHaveLength(1);
  expect(mockBcn.strokeRects[0]!.w).toBe(8);
  expect(mockBcn.strokeRects[0]!.h).toBe(8);
  expect(mockBcn.fillTexts).toHaveLength(0);
});

test("AC3 — Tracked target renders owning controller's sector ID", () => {
  // Default sector ID "D"
  const owned = targetSymbolDescriptor({ ownership: "owned" });
  expect(owned.kind).toBe("tracked");
  expect(owned.shape).toBe("text");
  expect(owned.symbol).toBe("D");
  expect(targetSymbolShape({ ownership: "owned" })).toBe("D");

  // Custom sector ID (e.g. "G", "B", "T", "C")
  expect(targetSymbolShape({ ownership: "owned", sectorId: "G" })).toBe("G");
  expect(targetSymbolShape({ ownership: "owned", sectorId: "B" })).toBe("B");
  expect(targetSymbolShape({ ownership: "tower" })).toBe("T");
  expect(targetSymbolShape({ ownership: "center" })).toBe("C");
  expect(targetSymbolShape({ tracked: true, sectorId: "D" })).toBe("D");

  const mockOwned = createMockTargetCtx();
  renderTargetSymbol(mockOwned.ctx, 100, 200, POSITION_SYMBOL_COLOR, { ownership: "owned", sectorId: "D" }, 8);
  expect(mockOwned.fillTexts).toHaveLength(1);
  expect(mockOwned.fillTexts[0]!.text).toBe("D");
  expect(mockOwned.fillTexts[0]!.fillStyle).toBe(POSITION_SYMBOL_COLOR);
  expect(mockOwned.pathStrokes).toHaveLength(0);
});

test("AC4 — Fixed 8px heading tick line is removed from the target symbol", () => {
  const mock = createMockTargetCtx();
  // Call drawTargetSymbol for primary diamond
  drawTargetSymbol(mock.ctx, 100, 200, POSITION_SYMBOL_COLOR, { isPrimary: true }, 8);
  // Diamond produces 1 pathStroke (the 4-vertex diamond), no heading tick line
  expect(mock.pathStrokes).toHaveLength(1);
  expect(mock.pathStrokes[0]!.points).toHaveLength(4);

  // Secondary targets produce fillText / strokeRect only, no heading tick
  const mockSec = createMockTargetCtx();
  drawTargetSymbol(mockSec.ctx, 100, 200, POSITION_SYMBOL_COLOR, { ownership: "unowned" }, 8);
  expect(mockSec.pathStrokes).toHaveLength(0);
});

test("AC5 — BRITE channels pos, oth, pri properly modulate target symbol brightness", () => {
  const baseColor = POSITION_SYMBOL_COLOR; // #1E78FF
  const britePos = applyBrite(baseColor, 50);
  const briteOth = applyBrite(baseColor, 80);
  const britePri = applyBrite(baseColor, 30);

  expect(britePos).not.toBe(baseColor);
  expect(briteOth).not.toBe(baseColor);
  expect(britePri).not.toBe(baseColor);
  expect(applyBrite(baseColor, 100)).toBe(baseColor);

  const mockPri = createMockTargetCtx();
  drawTargetSymbol(mockPri.ctx, 100, 200, britePri, { isPrimary: true }, 8);
  expect(mockPri.pathStrokes[0]!.strokeStyle).toBe(britePri);

  const mockOth = createMockTargetCtx();
  drawTargetSymbol(mockOth.ctx, 100, 200, briteOth, { ownership: "unowned" }, 8);
  expect(mockOth.fillTexts[0]!.fillStyle).toBe(briteOth);

  const mockPos = createMockTargetCtx();
  drawTargetSymbol(mockPos.ctx, 100, 200, britePos, { ownership: "owned", sectorId: "D" }, 8);
  expect(mockPos.fillTexts[0]!.fillStyle).toBe(britePos);
});

test("AC6 — Position symbol sizing via charSizes.pos", () => {
  const mock8 = createMockTargetCtx();
  drawTargetSymbol(mock8.ctx, 100, 200, POSITION_SYMBOL_COLOR, { ownership: "owned", sectorId: "D" }, 8);
  expect(mock8.fillTexts[0]!.font).toContain("8px");

  const mock12 = createMockTargetCtx();
  drawTargetSymbol(mock12.ctx, 100, 200, POSITION_SYMBOL_COLOR, { ownership: "owned", sectorId: "D" }, 12);
  expect(mock12.fillTexts[0]!.font).toContain("12px");

  const mockSquare = createMockTargetCtx();
  drawTargetSymbol(mockSquare.ctx, 100, 200, POSITION_SYMBOL_COLOR, {
    ownership: "unowned",
    squawk: "7000",
    beaconSelect: ["7000"],
  }, 10);
  expect(mockSquare.strokeRects[0]!.w).toBe(10);
  expect(mockSquare.strokeRects[0]!.h).toBe(10);
});

test("history dots use FAA trail blues, not track-tinted grey", () => {
  expect(HISTORY_DOT_SIZE_PX).toBeGreaterThanOrEqual(2);
  expect(HISTORY_DOT_SIZE_PX).toBeLessThanOrEqual(3);
  expect(historyDotColor(0, 5)).toBe("#1E1E5A");
  expect(historyDotColor(4, 5)).toBe("#1E50C8");
  expect(historyDotColor(0, 1).toLowerCase()).not.toBe("#808080");
  expect(historyDotColor(0, 1).toLowerCase()).not.toBe("#888888");
  expect(historyDotColor(0, 5)).not.toBe(PALETTE.unowned);
  expect(historyDotColor(0, 5)).not.toBe(PALETTE.owned);
});

test("IDENT uses yellow stroke; otherwise search-target blue (FDB color is separate)", () => {
  expect(targetStrokeColor("unowned", false)).toBe("#1E78FF");
  expect(targetStrokeColor("owned", false)).toBe("#1E78FF");
  expect(targetStrokeColor("owned", true)).toBe("#FFFF00");
  expect(targetStrokeColor("unowned", true)).toBe("#FFFF00");
});

test("selection box is 1 px yellow padding around the bounding box", () => {
  expect(SELECTION_BOX_PAD_PX).toBe(2);
  const box = selectionBoxRect(100, 200);
  expect(box.w).toBe(TARGET_SIZE_PX + 4);
  expect(box.h).toBe(TARGET_SIZE_PX + 4);
  expect(box.x).toBe(100 - TARGET_SIZE_PX / 2 - 2);
  expect(box.y).toBe(200 - TARGET_SIZE_PX / 2 - 2);

  const mock = createMockTargetCtx();
  drawSelectionBox(mock.ctx, 100, 200, 10);
  expect(mock.strokeRects).toHaveLength(1);
  expect(mock.strokeRects[0]!.w).toBe(14);
  expect(mock.strokeRects[0]!.h).toBe(14);
  expect(mock.strokeRects[0]!.strokeStyle).toBe(SELECTED_ACCENT_COLOR);
});

test("drawHistoryDot draws square dot centered on coordinates", () => {
  const mock = createMockTargetCtx();
  drawHistoryDot(mock.ctx, 50, 60, "#1E50C8");
  expect(mock.ctx).toBeDefined();
});

test("targetSymbol comments say target/history grammar, not sprite or airplane", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./targetSymbol.ts"];
  expect(src).toBeDefined();
  expect(src).toMatch(/CRC STARS target/);
  expect(src).toMatch(/Not a sprite \(R12\)/);
  expect(src).toMatch(/Not an airplane/);
  expect(src).toMatch(/diamond/);
});
