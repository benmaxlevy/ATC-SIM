import { expect, test } from "vitest";
import {
  HELP_COMMAND_GROUPS,
  KEY_BINDINGS,
  SCOPE_CHORD_WINDOW_MS,
  beginScopeChord,
  bindingById,
  isScopeChordLive,
} from "../keymap";
import { parsePreviewCommand } from "../previewParse";
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

  expect(entry("force-fdb")?.command).toBe("*F / **F");
  expect(entry("slash")?.result).toBe("Starts a Preview Area slew or drop command.");
  expect(entry("leader-length")?.result).toBe("Sets the default leader length.");
  expect(entry("maps-list")?.command).toBe("*TX");
  expect(entry("alert-list")?.command).toBe("*TM");
  expect(entry("ssa-list")?.command).toBe("*S");
  expect(
    entries.some((item) => item.command.includes("*ALL") || item.command.includes("*NONE")),
  ).toBe(false);

  for (const command of [
    "*FP AAL123",
    "*M 14 5252",
    "*DEL14",
    "*B UAL123",
    "*C",
    "*OFF",
    "*RR10",
    "*RRC",
    "*PTL5",
    "*R",
    "*HIST5",
    "*WX3",
    "*D DEM1_27",
    "*F030180",
    "*FC030180",
    "*LA030180",
    "*BCN45",
    "*T15",
    "*P1",
    "*TV",
    "*TM",
    "*TC",
    "*TS",
    "*TX",
    "*TN",
    "*S",
    "*L8",
    "*LDR4",
    "CA K 14",
    "*Q",
    "*V",
    "*MCI",
    "B45",
  ]) {
    expect(parsePreviewCommand(command), command).toMatchObject({ kind: "action" });
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
