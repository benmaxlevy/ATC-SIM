import { expect, test } from "vitest";
import { datablockAlertTint } from "@core";
import {
  BRITE_DISABLED_CHANNELS,
  BRITE_PAINT_CHANNELS,
  DEFAULT_BRITE,
  HISTORY_TRAIL,
  MAP_BRITE_STEPS,
  PALETTE,
  alertOrOwnershipColor,
  alertTintPaintColor,
  applyBrite,
  caDatablockTagVisible,
  historyTrailColor,
  mapBriteColors,
  snapBriteLevel,
  withCaDatablockTag,
} from "../palette";

test("TCW palette follows FAA/CRC/vice grammar, not a green CRT game map", () => {
  expect(PALETTE.background).toBe("#000000");
  expect(PALETTE.map.toUpperCase()).toBe("#8C8C8C");
  expect(PALETTE.mapDim.toUpperCase()).toBe("#606060");
  expect(PALETTE.map.toLowerCase()).not.toBe("#00aa00");
  expect(PALETTE.unowned).toBe("#00FF00");
  expect(PALETTE.unowned.toUpperCase()).not.toBe("#B8E0D0");
  expect(PALETTE.unowned.toUpperCase()).not.toBe("#DDDDDD");
  expect(PALETTE.owned).toBe("#FFFFFF");
  expect(PALETTE.owned.toUpperCase()).not.toBe("#00FF66");
  expect(PALETTE.positionSymbol.toUpperCase()).toBe("#1E78FF");
  expect(PALETTE.history.toUpperCase()).toBe("#1E50C8");
  expect(PALETTE.ptl).toBe("#FFFFFF");
  expect(PALETTE.ssa).toBe("#00FF00");
  expect(PALETTE.dcbCap).toMatch(/^#0[2-9A-F][0-9A-F]{4}$/i);
  expect(PALETTE.dcbCap).toBe("#061F0B");
  expect(PALETTE.dcbCell).toBe("#061F0B");
  expect(PALETTE.dcbText).toBe("#DCE0DC");
  expect(PALETTE.dcbDisabledText).toBe("#4C604C");
  expect(PALETTE.dcbHighlight).toBe("#7A8A7A");
  expect(PALETTE.dcbShadow).toBe("#000000");
  expect(PALETTE.dcbPressed).toBe("#005500");
  expect(PALETTE.dcbPressedText).toBe("#E0E0E0");
  expect(PALETTE.selected).toBe("#FFFF00");
  expect(PALETTE.caution).toBe("#FFFF00");
  expect(PALETTE.alert).toBe("#FF0000");
  expect(PALETTE.atpaWarning).toBe("#636300");
  expect(PALETTE.atpaAlert).toBe("#6A0800");
  expect(PALETTE.atpaAlert.toLowerCase()).not.toBe(PALETTE.alert.toLowerCase());
  expect(PALETTE.owned.toLowerCase()).not.toBe("#ff0000");
  expect(PALETTE.unowned.toLowerCase()).not.toBe("#ff0000");
});

test("ATPA owns its warning and alert hues; CA/MSAW caution and alert are untouched", () => {
  expect(PALETTE.atpaAlert).toBe("#6A0800");
  expect(PALETTE.atpaWarning).toBe("#636300");
  expect(PALETTE.atpaAlert).not.toBe(PALETTE.alert);
  expect(PALETTE.atpaWarning).not.toBe(PALETTE.caution);
  expect(PALETTE.alert).toBe("#FF0000");
  expect(PALETTE.caution).toBe("#FFFF00");
  expect(PALETTE.tools).toBe("#134767");
});

test("history trail is independent blue, newest brighter than oldest", () => {
  expect(HISTORY_TRAIL).toHaveLength(5);
  expect(historyTrailColor(0, 5)).toBe(HISTORY_TRAIL[4]);
  expect(historyTrailColor(4, 5)).toBe(HISTORY_TRAIL[0]);
  expect(historyTrailColor(0, 1)).toBe(HISTORY_TRAIL[0]);
  expect(historyTrailColor(0, 5).toLowerCase()).not.toBe("#808080");
  expect(historyTrailColor(0, 5).toLowerCase()).not.toBe(PALETTE.unowned.toLowerCase());
  expect(historyTrailColor(0, 5).toLowerCase()).not.toBe(PALETTE.owned.toLowerCase());
});

test("BRITE multiply keeps T02-08 hues; 100 is the palette color", () => {
  expect(applyBrite(PALETTE.map, 100)).toBe(PALETTE.map.toUpperCase());
  expect(applyBrite(PALETTE.unowned, 100)).toBe("#00FF00");
  expect(applyBrite(PALETTE.owned, 100)).toBe("#FFFFFF");
  expect(applyBrite(PALETTE.positionSymbol, 100).toUpperCase()).toBe("#1E78FF");
  const dimFdb = applyBrite(PALETTE.unowned, 50);
  expect(dimFdb).not.toBe("#00FF00");
  expect(dimFdb.startsWith("#00")).toBe(true);
  expect(dimFdb.toLowerCase()).not.toBe("#00ee00");
  const dimMap = applyBrite(PALETTE.map, 40);
  expect(dimMap).not.toBe(applyBrite(PALETTE.map, 100));
  const dimHst = applyBrite(PALETTE.history, 20);
  expect(dimHst).not.toBe(applyBrite(PALETTE.history, 100));
  const dimRr = applyBrite(PALETTE.mapDim, 10);
  expect(dimRr).not.toBe(applyBrite(PALETTE.mapDim, 100));
  const dimTls = applyBrite(PALETTE.ptl, 30);
  expect(dimTls).not.toBe("#FFFFFF");
  expect(snapBriteLevel(47)).toBe(50);
  expect(snapBriteLevel(-4)).toBe(0);
  expect(MAP_BRITE_STEPS.length).toBe(3);
  expect(mapBriteColors(1).map).toBe(PALETTE.map);
  expect(PALETTE.unowned).toBe("#00FF00");
  expect(PALETTE.owned).toBe("#FFFFFF");
});

test("palette comments name video map / datablock grammar, not tiles or nametags", () => {
  const sources = import.meta.glob("../*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["../palette.ts"]!;
  expect(src).toMatch(/7210\.3/);
  expect(src).toMatch(/CRC STARS/);
  expect(src).toMatch(/vice/);
  expect(src).toMatch(/Owned FDB white/);
  expect(src).toMatch(/dim gray/);
  expect(src.toLowerCase()).not.toMatch(/\bosm\b/);
  expect(src.toLowerCase()).not.toMatch(/nametag/);
  expect(src.toLowerCase()).not.toMatch(/sprite/);
});

test("AC5 — predicted CA is not yellow; CA and MSAW do not paint block/target", () => {
  expect(alertTintPaintColor(datablockAlertTint({ ca: "caution" }))).toBeNull();
  expect(alertTintPaintColor(datablockAlertTint({ ca: "alert" }))).toBeNull();
  expect(alertTintPaintColor(datablockAlertTint({ msaw: "caution" }))).toBeNull();
  expect(alertTintPaintColor(datablockAlertTint({ msaw: "alert" }))).toBeNull();
  expect(alertTintPaintColor(null)).toBeNull();
  expect(alertOrOwnershipColor("owned", "ca-alert")).toBe(PALETTE.owned);
  expect(alertOrOwnershipColor("owned", "msaw-alert")).toBe(PALETTE.owned);
  expect(alertOrOwnershipColor("owned", "ca-caution")).toBe(PALETTE.owned);
  expect(alertOrOwnershipColor("owned", "msaw-caution")).toBe(PALETTE.owned);
  expect(alertOrOwnershipColor("unowned", "msaw-alert")).toBe(PALETTE.unowned);
  expect(alertOrOwnershipColor("owned", null)).toBe(PALETTE.owned);
  expect(alertOrOwnershipColor("unowned", null)).toBe(PALETTE.unowned);
  expect(PALETTE.caution).toBe("#FFFF00");
  expect(PALETTE.alert).toBe("#FF0000");
  expect(PALETTE.atpaAlert).toBe("#6A0800");
  expect(PALETTE.atpaAlert).not.toBe(PALETTE.alert);
});

test("CA tag is static (does not blink); MSAW tag is not GPWS/TAWS", () => {
  expect(caDatablockTagVisible(0)).toBe(true);
  expect(caDatablockTagVisible(799)).toBe(true);
  expect(caDatablockTagVisible(800)).toBe(true);
  expect(withCaDatablockTag("DAL123", "ca-caution", 0)).toBe("DAL123");
  expect(withCaDatablockTag("DAL123", "ca-alert", 800)).toBe("DAL123");
  expect(withCaDatablockTag("DAL123", "msaw-caution")).toBe("DAL123");
  expect(withCaDatablockTag("DAL123", "msaw-alert")).toBe("DAL123");
  expect(withCaDatablockTag("DAL123", null)).toBe("DAL123");
  const sources = import.meta.glob("../palette.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["../palette.ts"]!;
  expect(src).toMatch(/world\.alerts/);
  expect(src).not.toMatch(/evaluateConflictAlert/);
  expect(src).not.toMatch(/evaluateMsaw/);
  expect(src).toMatch(/Do not label/);
  expect(src).toMatch(/not GPWS/);
  const paint = (
    import.meta.glob("../render/renderScopePaint.ts", {
      query: "?raw",
      import: "default",
      eager: true,
    }) as Record<string, string>
  )["../render/renderScopePaint.ts"]!;
  expect(paint).toMatch(/MSAW_DATABLOCK_TAG/);
  expect(paint).not.toMatch(/fillText\("MSAW"/);
});

test("CMP and BCN are live BRITE channels", () => {
  expect(BRITE_PAINT_CHANNELS).toContain("cmp");
  expect(BRITE_PAINT_CHANNELS).toContain("bcn");
  expect(BRITE_DISABLED_CHANNELS).not.toContain("cmp");
  expect(BRITE_DISABLED_CHANNELS).not.toContain("bcn");
  expect(DEFAULT_BRITE.cmp).toBe(100);
  expect(DEFAULT_BRITE.bcn).toBe(100);
});
