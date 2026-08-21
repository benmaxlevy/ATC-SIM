import { expect, test } from "vitest";
import { datablockAlertTint } from "./colors";

test("AC5 — datablockAlertTint follows CA alert > MSAW alert > CA caution > MSAW caution", () => {
  expect(datablockAlertTint({})).toBeNull();
  expect(datablockAlertTint({ ca: null, msaw: null })).toBeNull();
  expect(datablockAlertTint({ ca: "caution" })).toBe("ca-caution");
  expect(datablockAlertTint({ ca: "alert" })).toBe("ca-alert");
  expect(datablockAlertTint({ msaw: "caution" })).toBe("msaw-caution");
  expect(datablockAlertTint({ msaw: "alert" })).toBe("msaw-alert");
  expect(datablockAlertTint({ ca: "caution", msaw: "alert" })).toBe("msaw-alert");
  expect(datablockAlertTint({ ca: "alert", msaw: "alert" })).toBe("ca-alert");
  expect(datablockAlertTint({ ca: "caution", msaw: "caution" })).toBe("ca-caution");
  expect(datablockAlertTint({ ca: "alert", msaw: "caution" })).toBe("ca-alert");
});
