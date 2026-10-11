import { expect, test } from "vitest";
import {
  HELP_COMMAND_GROUPS,
  KEY_BINDINGS,
  SCOPE_CHORD_WINDOW_MS,
  beginScopeChord,
  bindingById,
  isScopeChordLive,
} from "../keymap";
import { parsePreviewCommand, parsePreviewCommandForOrigin } from "../previewParse";
import { parseStarsChord } from "../starsChord";

const REQUIRED_BINDING_IDS = [
  "range-in",
  "range-out",
  "center-airport",
  "center-click",
  "help",
  "track-suspend",
  "initiate-track",
  "flt-data",
  "drop-track",
  "tower-handoff",
  "multi-func",
  "history",
  "ptl",
  "ca-inhibit",
  "dcb-maps",
  "dcb-brite",
  "dcb-ldr",
  "dcb-char-size",
  "dcb-shift",
  "dcb-toggle",
  "dcb-rng-ring",
  "dcb-range",
  "dcb-wx",
  "dcb-pref",
  "cycle-focus",
  "mouse-range",
  "mouse-pan",
  "mouse-select",
  "mouse-accept-handoff",
  "mouse-deselect",
  "mouse-center",
  "mouse-place-cntr",
  "mouse-place-rr",
  "datablock",
  "mode-c",
  "altitude-filter",
  "history-scope",
  "radio-focus",
  "stars-tpa-atpa",
  "minimum-separation",
  "range-bearing-line",
] as const;

test("chord is live until 1.5 s, then expired", () => {
  const chord = beginScopeChord("L", 1000, "L_");
  expect(isScopeChordLive(chord, 1000 + SCOPE_CHORD_WINDOW_MS)).toBe(true);
  expect(isScopeChordLive(chord, 1000 + SCOPE_CHORD_WINDOW_MS + 1)).toBe(false);
});

test("KEY_BINDINGS cover the frozen Windows subset", () => {
  const ids = KEY_BINDINGS.map((b) => b.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of REQUIRED_BINDING_IDS) {
    expect(ids).toContain(id);
  }
  expect(ids).toHaveLength(REQUIRED_BINDING_IDS.length);
  expect(bindingById("range-in")?.windowsKeys).toBe("PageUp");
  expect(bindingById("initiate-track")?.focus).toBe("always");
});

test("Help lists live Preview command forms", () => {
  const entries = HELP_COMMAND_GROUPS.flatMap((group) => group.entries);
  const entry = (id: string) => entries.find((item) => item.id === id);

  expect(entry("force-fdb")?.command).toBe("**F");
  expect(entry("slash")?.result).toBe("Starts a Preview Area slew or drop command.");
  expect(entry("leader-length")?.result).toBe("Sets the default leader length.");
  expect(entry("maps-list")?.command).toBe("F7 TX");
  expect(entry("alert-list")?.command).toBe("F7 TM");
  expect(entry("ssa-list")?.command).toBe("F7 S");
  expect(
    entries.some((item) => item.command.includes("*ALL") || item.command.includes("*NONE")),
  ).toBe(false);
  expect(entry("range-bearing-line")?.result).toContain("*T SPACE FIX1 Enter, then FIX2 Enter");
  expect(entry("range-bearing-line")?.result).toContain("BBB/RR.RR[/M]-ID");
  expect(entry("range-bearing-line")?.result).toContain("*T SPACE DAL123");
  expect(entry("range-bearing-line")?.result).toContain("ACID/BCN");
  expect(entry("range-bearing-line")?.result).toContain("reported BCN");
  expect(entry("range-bearing-line")?.result).toContain("CAPACITY (9 lines)");
  expect(entry("range-bearing-line")?.result).toContain("DUP BCN");
  expect(entry("range-bearing-line")?.result).toContain("RBL ID");
  expect(bindingById("range-bearing-line")?.action).toContain("NO FLIGHT");
  expect(bindingById("range-bearing-line")?.action).toContain("reported BCN");

  for (const command of [
    "*FP AAL123",
    "F7 M 14 5252",
    "*DEL14",
    "F7 B UAL123",
    "*C",
    "*OFF",
    "*RR10",
    "*RRC",
    "*PTL5",
    "*R",
    "*HIST5",
    "*WX3",
    "*D DEM1_27",
    "F7 F030180",
    "F7 FC030180",
    "*LA030180",
    "*BCN45",
    "F7 T15",
    "F7 P1",
    "F7 TV",
    "F7 TM",
    "F7 TC",
    "F7 TS",
    "F7 TX",
    "F7 TN",
    "F7 S",
    "F7 L8",
    "*LDR4",
    "CA K 14",
    "F7 Q",
    "F7 V",
    "*MCI",
    "B45",
  ]) {
    const parsed = command.startsWith("F7 ")
      ? parsePreviewCommandForOrigin(command.slice(3), "multiFunc")
      : parsePreviewCommand(command);
    expect(parsed, command).toMatchObject({ kind: "action" });
  }

  expect(parseStarsChord("*F")).toMatchObject({
    kind: "action",
    action: { type: "forceFdb" },
  });
  expect(parseStarsChord("**F")).toMatchObject({
    kind: "action",
    action: { type: "forceFdbClear" },
  });
});
