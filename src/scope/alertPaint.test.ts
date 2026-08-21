import { expect, test } from "vitest";
import { datablockAlertTint } from "@core";
import { PALETTE } from "./palette";
import { alertOrOwnershipColor, alertTintPaintColor, withCaDatablockTag } from "./alertPaint";

test("AC5 — alert tint maps to caution yellow then alert red, else ownership", () => {
  expect(alertTintPaintColor(datablockAlertTint({ ca: "caution" }))).toBe(PALETTE.caution);
  expect(alertTintPaintColor(datablockAlertTint({ ca: "alert" }))).toBe(PALETTE.alert);
  expect(alertTintPaintColor(null)).toBeNull();
  expect(alertOrOwnershipColor("owned", "ca-alert")).toBe(PALETTE.alert);
  expect(alertOrOwnershipColor("owned", "ca-caution")).toBe(PALETTE.caution);
  expect(alertOrOwnershipColor("owned", null)).toBe(PALETTE.owned);
  expect(alertOrOwnershipColor("unowned", null)).toBe(PALETTE.unowned);
  expect(PALETTE.caution).toBe("#FFFF00");
  expect(PALETTE.alert).toBe("#FF0000");
});

test("optional CA tag is not labeled STARS CA", () => {
  expect(withCaDatablockTag("DAL123", "ca-caution")).toBe("DAL123 CA");
  expect(withCaDatablockTag("DAL123", "ca-alert")).toBe("DAL123 CA");
  expect(withCaDatablockTag("DAL123", null)).toBe("DAL123");
  const sources = import.meta.glob("./alertPaint.ts", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const src = sources["./alertPaint.ts"]!;
  expect(src).toMatch(/world\.alerts/);
  expect(src).not.toMatch(/evaluateConflictAlert/);
  expect(src).toMatch(/Do not label/);
});
