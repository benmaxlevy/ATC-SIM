import { expect, test } from "vitest";
import { parsePreviewCommand, idlePreviewArea, previewAreaIsLive } from "./previewArea";

test("idle preview is not live", () => {
  const idle = idlePreviewArea();
  expect(idle.phase).toBe("idle");
  expect(previewAreaIsLive(idle)).toBe(false);
});

test("parsePreviewCommand: empty is incomplete; unknown is invalid", () => {
  expect(parsePreviewCommand("")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("B")).toEqual({ kind: "incomplete" });
  expect(parsePreviewCommand("HELLO")).toMatchObject({ kind: "invalid" });
});

test("B45 is a beacon block action", () => {
  const parsed = parsePreviewCommand("B45");
  expect(parsed.kind).toBe("action");
  if (parsed.kind === "action") {
    expect(parsed.action).toEqual({ type: "beaconBlock", digits: "45" });
  }
});
