import { expect, test } from "vitest";
import { parsePreviewCommand, idlePreviewArea, previewAreaIsLive } from "../previewArea";

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

test("CRC STARS leader length and direction command parsing", () => {
  // /<0-7>
  expect(parsePreviewCommand("/2")).toEqual({
    kind: "action",
    action: { type: "setLeaderLength", lengthStep: 2, lengthPx: 24 },
  });
  expect(parsePreviewCommand("/0 DAL123")).toEqual({
    kind: "action",
    action: { type: "setLeaderLength", lengthStep: 0, lengthPx: 0, flid: "DAL123" },
  });

  // Direct <1-9> and <1-9>/<0-7>
  expect(parsePreviewCommand("8")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", dir: 8 },
  });
  expect(parsePreviewCommand("8 DAL123")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", dir: 8, flid: "DAL123" },
  });
  expect(parsePreviewCommand("8/3")).toEqual({
    kind: "action",
    action: { type: "setLeaderDirAndLength", dir: 8, lengthStep: 3, lengthPx: 36 },
  });
  expect(parsePreviewCommand("8/3 DAL123")).toEqual({
    kind: "action",
    action: { type: "setLeaderDirAndLength", dir: 8, lengthStep: 3, lengthPx: 36, flid: "DAL123" },
  });

  // *L(1-9)
  expect(parsePreviewCommand("*L6")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", dir: 6, scope: "allOwned" },
  });
  expect(parsePreviewCommand("*L6 DAL123")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", dir: 6, flid: "DAL123" },
  });
  expect(parsePreviewCommand("*L6*")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", dir: 6, scope: "allUnowned" },
  });
  expect(parsePreviewCommand("*L6U")).toEqual({
    kind: "action",
    action: { type: "setLeaderDir", dir: 6, scope: "allUnassociated" },
  });
  expect(parsePreviewCommand("*L8/2")).toEqual({
    kind: "action",
    action: { type: "setLeaderDirAndLength", dir: 8, lengthStep: 2, lengthPx: 24 },
  });
  expect(parsePreviewCommand("*L8/2 DAL123")).toEqual({
    kind: "action",
    action: { type: "setLeaderDirAndLength", dir: 8, lengthStep: 2, lengthPx: 24, flid: "DAL123" },
  });

  // *LDR <0-7>
  expect(parsePreviewCommand("*LDR 4")).toEqual({
    kind: "action",
    action: { type: "setDefaultLeaderLength", lengthStep: 4, lengthPx: 48 },
  });
});
