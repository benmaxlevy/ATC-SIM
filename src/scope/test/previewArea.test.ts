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

test("STARS authorized system list commands parse correctly", () => {
  // *S relocate SSA
  expect(parsePreviewCommand("*S")).toEqual({
    kind: "action",
    action: { type: "armRelocateList", listId: "SSA" },
  });

  // *T toggle TAB list, resize, and reset
  expect(parsePreviewCommand("*T")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "FL" },
  });
  expect(parsePreviewCommand("*T 15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "FL", maxLines: 15 },
  });
  expect(parsePreviewCommand("*T15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "FL", maxLines: 15 },
  });
  expect(parsePreviewCommand("*T D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "FL" },
  });
  expect(parsePreviewCommand("*TD")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "FL" },
  });

  // *TV toggle VFR list, resize, and reset
  expect(parsePreviewCommand("*TV")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "VL" },
  });
  expect(parsePreviewCommand("*TV 15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "VL", maxLines: 15 },
  });
  expect(parsePreviewCommand("*TV15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "VL", maxLines: 15 },
  });
  expect(parsePreviewCommand("*TV D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "VL" },
  });

  // *TM toggle LA/CA/MCI list and reset
  expect(parsePreviewCommand("*TM")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "AL" },
  });
  expect(parsePreviewCommand("*TM D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "AL" },
  });

  // *TC toggle COAST list, resize, and reset
  expect(parsePreviewCommand("*TC")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "COAST" },
  });
  expect(parsePreviewCommand("*TC 15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "COAST", maxLines: 15 },
  });
  expect(parsePreviewCommand("*TC15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "COAST", maxLines: 15 },
  });
  expect(parsePreviewCommand("*TC D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "COAST" },
  });

  // *TS toggle SIGN ON list and reset
  expect(parsePreviewCommand("*TS")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "SIGN_ON" },
  });
  expect(parsePreviewCommand("*TS D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "SIGN_ON" },
  });

  // *TX toggle VIDEO MAPS list and reset
  expect(parsePreviewCommand("*TX")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "ML" },
  });
  expect(parsePreviewCommand("*TX D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "ML" },
  });

  // *TN toggle CRDA STATUS list and reset
  expect(parsePreviewCommand("*TN")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "CRDA" },
  });
  expect(parsePreviewCommand("*TN D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "CRDA" },
  });

  // *P1, *P2, *P3 toggle TOWER lists, resize, and reset
  expect(parsePreviewCommand("*P1")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "TOWER_1" },
  });
  expect(parsePreviewCommand("*P2")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "TOWER_2" },
  });
  expect(parsePreviewCommand("*P3")).toEqual({
    kind: "action",
    action: { type: "toggleList", listId: "TOWER_3" },
  });
  expect(parsePreviewCommand("*P1 10")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "TOWER_1", maxLines: 10 },
  });
  expect(parsePreviewCommand("*P2 20")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "TOWER_2", maxLines: 20 },
  });
  expect(parsePreviewCommand("*P3 15")).toEqual({
    kind: "action",
    action: { type: "resizeList", listId: "TOWER_3", maxLines: 15 },
  });
  expect(parsePreviewCommand("*P1 D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "TOWER_1" },
  });
  expect(parsePreviewCommand("*P2 D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "TOWER_2" },
  });
  expect(parsePreviewCommand("*P3 D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "TOWER_3" },
  });

  // *S D reset SSA
  expect(parsePreviewCommand("*S D")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "SSA" },
  });
  expect(parsePreviewCommand("*SD")).toEqual({
    kind: "action",
    action: { type: "resetListPosition", listId: "SSA" },
  });
});

test("STARS system list command aliases are strictly rejected as invalid", () => {
  const rejectedAliases = [
    "*FL",
    "*FL10",
    "*FL 25",
    "*FL D",
    "*FLD",
    "*TAB",
    "*TAB 10",
    "*TAB D",
    "*FPL",
    "*VL",
    "*VL10",
    "*VL 25",
    "*VL D",
    "*VLD",
    "*VFR",
    "*TL",
    "*TL D",
    "*TLD",
    "*TL1",
    "*TLBED",
    "*TLBED 10",
    "*TLBOS",
    "*ML",
    "*ML D",
    "*MLD",
    "*AL",
    "*AL D",
    "*ALD",
    "*CR",
    "*CR D",
    "*CRD",
    "*CRDA",
    "*CRDA D",
    "*CS",
    "*CS D",
    "*CSD",
    "*COAST",
    "*COAST D",
    "*SO",
    "*SO D",
    "*SOD",
    "*SIGN_ON",
    "*SIGN_ON D",
    "*SSA",
    "*SSA D",
    "*SSAD",
  ];

  for (const alias of rejectedAliases) {
    expect(parsePreviewCommand(alias).kind, `Command ${alias} must be invalid`).toBe("invalid");
  }
});
