import { expect, test } from "vitest";
import { datablockAlertTint } from "@core";
import { PALETTE } from "./palette";
import {
  alertOrOwnershipColor,
  alertTintPaintColor,
  caDatablockTagVisible,
  withCaDatablockTag,
} from "./alertPaint";

test("AC5 — predicted CA is not yellow; current CA and MSAW still paint", () => {
  expect(alertTintPaintColor(datablockAlertTint({ ca: "caution" }))).toBeNull();
  expect(alertTintPaintColor(datablockAlertTint({ ca: "alert" }))).toBe(PALETTE.alert);
  expect(alertTintPaintColor(datablockAlertTint({ msaw: "caution" }))).toBe(PALETTE.caution);
  expect(alertTintPaintColor(datablockAlertTint({ msaw: "alert" }))).toBe(PALETTE.alert);
  expect(alertTintPaintColor(null)).toBeNull();
  expect(alertOrOwnershipColor("owned", "ca-alert")).toBe(PALETTE.alert);
  expect(alertOrOwnershipColor("owned", "msaw-alert")).toBe(PALETTE.alert);
  expect(alertOrOwnershipColor("owned", "ca-caution")).toBe(PALETTE.owned);
  expect(alertOrOwnershipColor("owned", "msaw-caution")).toBe(PALETTE.caution);
  expect(alertOrOwnershipColor("owned", null)).toBe(PALETTE.owned);
  expect(alertOrOwnershipColor("unowned", null)).toBe(PALETTE.unowned);
  expect(PALETTE.caution).toBe("#FFFF00");
  expect(PALETTE.alert).toBe("#FF0000");
});

test("CA tag blinks on sim time; MSAW tag is not GPWS/TAWS", () => {
  expect(caDatablockTagVisible(0)).toBe(true);
  expect(caDatablockTagVisible(499)).toBe(true);
  expect(caDatablockTagVisible(500)).toBe(false);
  expect(withCaDatablockTag("DAL123", "ca-caution", 0)).toBe("DAL123 CA");
  expect(withCaDatablockTag("DAL123", "ca-alert", 500)).toBe("DAL123   ");
  expect(withCaDatablockTag("DAL123", "msaw-caution")).toBe("DAL123 MSAW");
  expect(withCaDatablockTag("DAL123", "msaw-alert")).toBe("DAL123 MSAW");
  expect(withCaDatablockTag("DAL123", null)).toBe("DAL123");
  const sources = import.meta.glob("./alertPaint.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./alertPaint.ts"]!;
  expect(src).toMatch(/world\.alerts/);
  expect(src).not.toMatch(/evaluateConflictAlert/);
  expect(src).not.toMatch(/evaluateMsaw/);
  expect(src).toMatch(/Do not label/);
  expect(src).toMatch(/not GPWS/);
});
