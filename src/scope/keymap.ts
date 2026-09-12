/**
 * Analog: CRC STARS keyboard / DCB (docs.virtualnas.net/crc/stars — R07).
 * CRC F1 = INIT CNTL; F3 = Track Suspend;
 * L1–L9 = leader direction; DCB RANGE spinner; PTL OWN/ALL; `/` = leader
 * length. vice (R08) is typed-radio feel, not this map.
 * Trainer delta: exported Windows subset only — Help is `?` / the Help button,
 * F3 Track Suspend is reserved/no-op for now, PageUp/Down range presets 5–60 (no CRC 6/8/12/16/24), `/` when
 * scope-focused buffers into the Preview Area (not leader length; Tab cycles
 * radio ↔ PPI). 1.5 s L/F
 * chord window (`*` persists until Esc, commit, or a new `*`); leftover digits never go to the parser; no keyboard leader-length menu
 * (`/` is Preview Area slew/drop prefix). DCB LDR length is a discrete px spinner. `F` is scope-focus only.
 * `*` with PPI focused is TPA/ATPA slew chords (R07 Table 36), never Command IR.
 * Inject `nowMs` in tests. Not NAS STARS.
 */

export type KeyFocus = "always" | "scope";

export interface KeyBinding {
  id: string;
  focus: KeyFocus;
  windowsKeys: string; // e.g. "PageUp" | "Ctrl+F1"
  action: string;
  crcAnalog: string;
}

/** Help overlay footer. */
export const HELP_FOOTER = "TRAINER COMMANDS — LOCAL REFERENCE";

/** One-line in-app pointer (T02-13). Overlay is ? / Shift+/ (or Alt+F1); this is how you find it. */
export const HELP_KEYS_POINTER = "? lists keys.";

/** Radio vs scope pipeline. Overlay must include this; never a CRC cheat sheet. */
export const RADIO_CONFLICT_WARNING =
  "Radio commands stay on the command line and never come from scope keys. L090 is a left turn to heading 090 when the command line is focused.";

/** Glossary terms the overlay must teach (range, datablock, leader, initiate track). */
export const HELP_GLOSSARY_NOTE =
  "Use this reference for the trainer's active commands. Radio commands use the command line; display commands use the PPI, Preview Area, DCB, or mouse.";

export interface HelpCommandEntry {
  id: string;
  command: string;
  example: string;
  input: string;
  result: string;
}

export interface HelpCommandGroup {
  id: string;
  title: string;
  entries: HelpCommandEntry[];
}

export interface HelpNavigationGroup {
  id: string;
  title: string;
  commandGroupIds: string[];
}

/** User-facing command reference shared by the Help menu and tests. */
export const HELP_COMMAND_GROUPS: HelpCommandGroup[] = [
  {
    id: "radio",
    title: "Radio commands — command line or PTT",
    entries: [
      {
        id: "heading",
        command: "H <heading>",
        example: "H270",
        input: "Radio",
        result: "Turn left/right to the heading.",
      },
      {
        id: "altitude",
        command: "C <altitude>",
        example: "C30",
        input: "Radio",
        result: "Climb or descend to the altitude.",
      },
      {
        id: "speed",
        command: "S <knots>",
        example: "S210",
        input: "Radio",
        result: "Set the aircraft speed.",
      },
      {
        id: "approach",
        command: "A <approach>",
        example: "A ILS27",
        input: "Radio",
        result: "Issue a supported approach clearance.",
      },
      {
        id: "callsign",
        command: "<callsign> <instructions>",
        example: "DAL123 H270",
        input: "Radio",
        result: "Address one aircraft, then apply its clearance.",
      },
    ],
  },
  {
    id: "preview",
    title: "Preview Area commands — display only",
    entries: [
      {
        id: "init",
        command: "F1 / +",
        example: "F1, identity, then click",
        input: "PPI or Preview Area",
        result: "Initiate or associate the selected track and own it.",
      },
      {
        id: "suspend",
        command: "F3",
        example: "F3",
        input: "Always-on key",
        result: "Reserved Track Suspend; currently a no-op.",
      },
      {
        id: "flt-data",
        command: "F6 / FLT DATA <ACID> [fields]",
        example: "F6 UAL1234 2341 KDEM*RW27 B738 250 .A",
        input: "Any focus, then Preview Area",
        result: "Create one local full IFR flight plan; no Command IR or aircraft mutation.",
      },
      {
        id: "vfr-data",
        command: "F9 / VFR DATA",
        example: "F9 N123AB KDEM*RW27 C172 050 Enter",
        input: "Any focus, then Preview Area",
        result:
          "Create or modify one local VFR plan; F9 ACID/index Enter deletes; F9 * 050 then click uses an eligible associated VFR track; resend an amended exit/intermediate fix with the same ACID.",
      },
      {
        id: "terminate",
        command: "F4",
        example: "F4, then click",
        input: "PPI or Preview Area",
        result: "Terminate the selected track and remove its local plan.",
      },
      {
        id: "multi",
        command: "F7 / *",
        example: "*T",
        input: "PPI or Preview Area",
        result: "Start a MULTI FUNC command.",
      },
      {
        id: "tracking",
        command: "*L1–*L9",
        example: "*L8, then click",
        input: "Preview Area",
        result: "Set the selected track's leader direction.",
      },
      {
        id: "lists",
        command: "*T, *P1–*P3, *TV, *TX",
        example: "*T15",
        input: "Preview Area",
        result: "Open the matching system list.",
      },
    ],
  },
  {
    id: "scope",
    title: "Scope commands — PPI focused",
    entries: [
      {
        id: "range",
        command: "PageUp / PageDown",
        example: "PageUp",
        input: "Any focus",
        result: "Step through the 5–60 NM range presets.",
      },
      {
        id: "center",
        command: "Home / End",
        example: "Home",
        input: "Any focus",
        result: "Center on the airport or last PPI click.",
      },
      {
        id: "datablock",
        command: "T",
        example: "T",
        input: "PPI",
        result: "Toggle full or limited datablock display.",
      },
      {
        id: "mode-c",
        command: "M",
        example: "M",
        input: "PPI",
        result: "Toggle Mode C on full datablocks.",
      },
      {
        id: "filter",
        command: "F <min> Enter <max> Enter",
        example: "F030 Enter 180 Enter",
        input: "PPI",
        result: "Set the altitude filter in Mode C hundreds.",
      },
      {
        id: "history",
        command: "H / F8",
        example: "H",
        input: "PPI or any focus",
        result: "Toggle history dots.",
      },
    ],
  },
  {
    id: "display",
    title: "Display and map commands — Preview Area",
    entries: [
      {
        id: "scope-center",
        command: "*C / *OFF",
        example: "*C, then click",
        input: "Preview Area",
        result: "Place the view center or restore the airport center.",
      },
      {
        id: "range-rings",
        command: "*RR <NM> / *RR CNTR",
        example: "*RR10",
        input: "Preview Area",
        result: "Set range-ring spacing or center the rings.",
      },
      {
        id: "ptl",
        command: "*PTL <minutes> / *R",
        example: "*PTL5",
        input: "Preview Area",
        result: "Set global or selected-track predicted track line.",
      },
      {
        id: "hist",
        command: "*HIST <count>",
        example: "*HIST5",
        input: "Preview Area",
        result: "Set the number of history dots.",
      },
      {
        id: "weather",
        command: "*WX <level> / *WX ALL / *WX OFF",
        example: "*WX3",
        input: "Preview Area",
        result: "Toggle the selected weather display level.",
      },
      {
        id: "maps",
        command: "*D <map> / *D ALL / *D NONE",
        example: "*D DEM1_27",
        input: "Preview Area",
        result: "Toggle a video map or all maps.",
      },
      {
        id: "altitude",
        command: "*F / *FC / *LA <floor><ceiling>",
        example: "*F030180 or *LA030180",
        input: "Preview Area",
        result: "Display or set general limits; *FC sets associated-only limits.",
      },
      {
        id: "beacon-filter",
        command: "*BCN <code>",
        example: "*BCN45",
        input: "Preview Area",
        result: "Add or remove a beacon-code display filter.",
      },
    ],
  },
  {
    id: "lists",
    title: "System lists and flight plans — Preview Area",
    entries: [
      {
        id: "tab-list",
        command: "*T [lines]",
        example: "*T15",
        input: "Preview Area",
        result: "Toggle or resize the TAB flight-plan list.",
      },
      {
        id: "tower-list",
        command: "*P1–*P3 [lines]",
        example: "*P1",
        input: "Preview Area",
        result: "Toggle or resize a tower list.",
      },
      {
        id: "vfr-list",
        command: "*TV [lines]",
        example: "*TV",
        input: "Preview Area",
        result: "Toggle or resize the VFR list.",
      },
      {
        id: "maps-list",
        command: "*TX [lines]",
        example: "*TX",
        input: "Preview Area",
        result: "Toggle or resize the video-map directory.",
      },
      {
        id: "alert-list",
        command: "*TM [lines]",
        example: "*TM",
        input: "Preview Area",
        result: "Toggle or resize the alert status list.",
      },
      {
        id: "coast-list",
        command: "*TC [lines]",
        example: "*TC",
        input: "Preview Area",
        result: "Toggle or resize the coast/suspend list.",
      },
      {
        id: "sign-on-list",
        command: "*TS",
        example: "*TS",
        input: "Preview Area",
        result: "Toggle the sign-on list.",
      },
      {
        id: "ssa-list",
        command: "*S [lines]",
        example: "*S",
        input: "Preview Area",
        result: "Toggle or resize the system status list.",
      },
      {
        id: "crda-list",
        command: "*TN",
        example: "*TN",
        input: "Preview Area",
        result: "Toggle the CRDA status list.",
      },
      {
        id: "plan-create",
        command: "<ACID> [fields]",
        example: "UAL1234 2341 AT B738",
        input: "Preview Area",
        result: "Abbreviated creation: create a pending local flight plan.",
      },
      {
        id: "plan-pending-discrete",
        command: "F1 / INIT CNTL <ACID> <beacon> [fields]",
        example: "F1 UAL1234 2341, then click",
        input: "INIT CNTL Preview path",
        result: "Create a pending local discrete plan; identity association remains separate.",
      },
      {
        id: "plan-modify",
        command: "*M <identity> <data>",
        example: "*M 14 5252",
        input: "Preview Area",
        result: "Modify a plan by ACID, beacon, or list index.",
      },
      {
        id: "plan-delete",
        command: "*DEL <index>",
        example: "*DEL14",
        input: "Preview Area",
        result: "Delete the plan at the TAB-list index.",
      },
      {
        id: "plan-beacon",
        command: "*B <identity>",
        example: "*B UAL1234",
        input: "Preview Area",
        result: "Release the plan's assigned beacon.",
      },
    ],
  },
  {
    id: "tracking-alerts",
    title: "Tracking and alert controls — Preview Area",
    entries: [
      {
        id: "force-fdb",
        command: "*ALL / *NONE",
        example: "*ALL",
        input: "Preview Area",
        result: "Force full datablocks on or clear the force.",
      },
      {
        id: "leader",
        command: "+ / /<FLID> / *0 / *1–*8",
        example: "+, then click; *L8, then click",
        input: "Preview Area",
        result: "Initiate/terminate by target, or set leader direction; *0 clears it.",
      },
      {
        id: "leader-length",
        command: "*LDR <0–7>",
        example: "*LDR4",
        input: "Preview Area",
        result: "Set the selected leader length.",
      },
      {
        id: "ca",
        command: "CA / CA K / CA P / CA C",
        example: "CA K 14; CA P 14 18; CA C I",
        input: "Preview Area",
        result:
          "Pair slew; toggle one-track inhibit; toggle pair inhibit; or enable/inhibit controller pairs.",
      },
      {
        id: "msaw",
        command: "*Q / *V",
        example: "*Q, then click",
        input: "Preview Area",
        result: "Inhibit the selected current alert or toggle MSAW processing.",
      },
      {
        id: "mci",
        command: "*MCI",
        example: "*MCI",
        input: "Preview Area",
        result: "Toggle the selected beacon-code mismatch inhibit.",
      },
      {
        id: "beacon-select",
        command: "B<2 or 4 octal digits>",
        example: "B45 or B4501",
        input: "PPI or Preview Area",
        result: "Select a beacon-code block or discrete code.",
      },
    ],
  },
  {
    id: "focus",
    title: "Focus and safety rules",
    entries: [
      {
        id: "tab",
        command: "Tab",
        example: "Tab",
        input: "Any focus",
        result: "Cycle focus between the command line and PPI.",
      },
      {
        id: "slash",
        command: "/",
        example: "/",
        input: "PPI",
        result: "Focus the command line; it does not insert a slash.",
      },
      {
        id: "radio-conflict",
        command: "L090",
        example: "L090",
        input: "Command line",
        result: "Radio left turn to heading 090; scope keys never submit radio commands.",
      },
      {
        id: "escape",
        command: "Escape",
        example: "Esc",
        input: "Any focus",
        result: "Cancel or disarm the active Preview, filter, DCB, or Help state.",
      },
    ],
  },
];

/** Top-level navigation keeps the command list scannable without hiding detail. */
export const HELP_NAVIGATION_GROUPS: HelpNavigationGroup[] = [
  {
    id: "simulation",
    title: "Simulation commands",
    commandGroupIds: ["radio", "preview", "lists", "tracking-alerts"],
  },
  {
    id: "scope",
    title: "Scope commands",
    commandGroupIds: ["scope", "display"],
  },
  {
    id: "controls",
    title: "Controls and input",
    commandGroupIds: ["focus"],
  },
];

/**
 * Frozen Windows subset from phases/02-scope/README.md.
 * Help overlay renders this array — do not duplicate rows in JSX.
 */
export const KEY_BINDINGS: KeyBinding[] = [
  {
    id: "range-in",
    focus: "always",
    windowsKeys: "PageUp",
    action: "Range in (smaller NM preset). At 5 NM: no-op, no wrap.",
    crcAnalog: "DCB RANGE spinner / Ctrl+F10 RANGE",
  },
  {
    id: "range-out",
    focus: "always",
    windowsKeys: "PageDown",
    action: "Range out (larger NM preset). At 60 NM: no-op, no wrap.",
    crcAnalog: "DCB RANGE spinner / Ctrl+F10 RANGE",
  },
  {
    id: "center-airport",
    focus: "always",
    windowsKeys: "Home",
    action: "Center on airport ref (KDEM ARP).",
    crcAnalog: "CENTER then click / Ctrl+F1 re-center",
  },
  {
    id: "center-click",
    focus: "always",
    windowsKeys: "End",
    action: "Center on last PPI click (or airport if none this session).",
    crcAnalog: "CENTER then click",
  },
  {
    id: "help",
    focus: "always",
    windowsKeys: "? / Shift+/ / Help button (or Alt+F1)",
    action: "Toggle this help overlay. Not browser help.",
    crcAnalog: "Trainer help (? / Shift+/ / Help button / Alt+F1)",
  },
  {
    id: "initiate-track",
    focus: "always",
    windowsKeys: "F1",
    action: "INIT CNTL: selected target applies now; otherwise arm command-then-slew.",
    crcAnalog: "F1 <INIT CNTL>",
  },
  {
    id: "flt-data",
    focus: "always",
    windowsKeys: "F6",
    action:
      "FLT DATA: enter full IFR flight-plan data in Preview Area. Local record only; no radio parser or Command IR.",
    crcAnalog: "F6 <FLT DATA>",
  },
  {
    id: "track-suspend",
    focus: "always",
    windowsKeys: "F3",
    action: "Track Suspend reserved. No-op until suspend lifecycle is implemented.",
    crcAnalog: "F3 <TRK SUSP>",
  },
  {
    id: "drop-track",
    focus: "always",
    windowsKeys: "F4",
    action:
      "TERM CNTL drop track: selected drops now; no selection arms command-then-slew; type FLID then Enter or slew. Trainer drop, not TERM CNTL ALL.",
    crcAnalog: "F4 TERM CNTL / <TERM CNTL><SLEW> / <TERM CNTL><FLID><ENTER>",
  },
  {
    id: "tower-handoff",
    focus: "always",
    windowsKeys: "F5 (or Shift+H)",
    action: "Initiate handoff: Tower (if on approach) or Center (if climbing outbound)",
    crcAnalog: "F5 <HND OFF> (or Shift+H)",
  },
  {
    id: "multi-func",
    focus: "always",
    windowsKeys: "F7",
    action: "STARS multi-func preview buffer: inputs * into preview buffer or appends to buffer.",
    crcAnalog: "F7 <MULTI FUNC>",
  },
  {
    id: "history",
    focus: "always",
    windowsKeys: "F8",
    action: "Toggle history dots (0 ↔ last non-zero count).",
    crcAnalog: "F8 <HIST>",
  },
  {
    id: "ptl",
    focus: "always",
    windowsKeys: "F10",
    action: "Toggle PTL ALL (predicted track line).",
    crcAnalog: "F10 <PTL>",
  },
  {
    id: "ca-inhibit",
    focus: "always",
    windowsKeys: "F11",
    action: 'Input "CA " into preview area (STARS Table 18 <CA>)',
    crcAnalog: "F11 <CA>",
  },
  {
    id: "dcb-maps",
    focus: "always",
    windowsKeys: "Ctrl+F2",
    action: "Open DCB MAPS submenu.",
    crcAnalog: "Ctrl+F2 <MAPS>",
  },
  {
    id: "dcb-brite",
    focus: "always",
    windowsKeys: "Ctrl+F3",
    action: "Open DCB BRITE submenu.",
    crcAnalog: "Ctrl+F3 <BRITE>",
  },
  {
    id: "dcb-ldr",
    focus: "always",
    windowsKeys: "Ctrl+F4",
    action: "Open DCB LDR submenu.",
    crcAnalog: "Ctrl+F4 <LDR>",
  },
  {
    id: "dcb-char-size",
    focus: "always",
    windowsKeys: "Ctrl+F5",
    action: "Open DCB CHAR SIZE submenu.",
    crcAnalog: "Ctrl+F5 <CHAR SIZE>",
  },
  {
    id: "dcb-shift",
    focus: "always",
    windowsKeys: "Ctrl+F7",
    action: "Toggle DCB MAIN and AUX menus.",
    crcAnalog: "Ctrl+F7 <SHIFT>",
  },
  {
    id: "dcb-toggle",
    focus: "always",
    windowsKeys: "Ctrl+F8",
    action: "Toggle DCB display visibility.",
    crcAnalog: "Ctrl+F8 <DCB>",
  },
  {
    id: "dcb-rng-ring",
    focus: "always",
    windowsKeys: "Ctrl+F9",
    action: "Arm DCB range ring (RR) spinner.",
    crcAnalog: "Ctrl+F9 <RNG RING>",
  },
  {
    id: "dcb-range",
    focus: "always",
    windowsKeys: "Ctrl+F10",
    action: "Arm DCB RANGE spinner.",
    crcAnalog: "Ctrl+F10 <RANGE>",
  },
  {
    id: "dcb-wx",
    focus: "always",
    windowsKeys: "Ctrl+F11",
    action: "Toggle WX layers on/off.",
    crcAnalog: "Ctrl+F11 <WX>",
  },
  {
    id: "dcb-pref",
    focus: "always",
    windowsKeys: "Insert (Ins)",
    action: "Initiate DCB PREF submenu.",
    crcAnalog: "Ins <PREF SET>",
  },
  {
    id: "cycle-focus",
    focus: "always",
    windowsKeys: "Tab",
    action: "Cycle focus: command line ↔ PPI. Does not steal Tab from help overlay inputs.",
    crcAnalog: "Not CRC — trainer radio vs scope focus",
  },
  {
    id: "mouse-range",
    focus: "always",
    windowsKeys: "Wheel up / down",
    action: "Range in / out (same presets as PageUp/PageDown). No zoom-to-cursor.",
    crcAnalog: "DCB RANGE spinner wheel",
  },
  {
    id: "mouse-pan",
    focus: "always",
    windowsKeys: "Right-button drag (middle-button still works)",
    action: "Slew view center (trainer sugar). Not CRC.",
    crcAnalog: "Not CRC — CRC is CENTER then click",
  },
  {
    id: "mouse-select",
    focus: "always",
    windowsKeys: "Left click on target or datablock",
    action: "Select track.",
    crcAnalog: "Slew / click target",
  },
  {
    id: "mouse-accept-handoff",
    focus: "always",
    windowsKeys: "Left click pending inbound track",
    action: "CLICK accept inbound handoff (CRC slew analog)",
    crcAnalog: "CRC STARS: slew the track to accept the handoff",
  },
  {
    id: "mouse-deselect",
    focus: "always",
    windowsKeys: "Left click empty PPI",
    action: "Deselect.",
    crcAnalog: "Click empty display",
  },
  {
    id: "mouse-center",
    focus: "always",
    windowsKeys: "Double-click empty PPI",
    action: "Center view on that world point.",
    crcAnalog: "CENTER then click",
  },
  {
    id: "mouse-place-cntr",
    focus: "always",
    windowsKeys: "DCB PLACE CNTR, then PPI click",
    action:
      "Set view center to that world point. DCB OFF CNTR (or Home) recenters the airport. End uses last click. No zoom-to-cursor.",
    crcAnalog: "DCB PLACE CNTR then click",
  },
  {
    id: "mouse-place-rr",
    focus: "always",
    windowsKeys: "DCB PLACE RR, then PPI click",
    action: "Set range-ring origin to that world point. RR CNTR snaps origin to the view center.",
    crcAnalog: "DCB PLACE RR then click",
  },
  {
    id: "datablock",
    focus: "scope",
    windowsKeys: "T",
    action: "Full ↔ limited datablock. Selected track, or all if none selected.",
    crcAnalog: "Tag/untag analog (FDB / LDB)",
  },
  {
    id: "mode-c",
    focus: "scope",
    windowsKeys: "M",
    action: "Mode C field on/off on full datablocks.",
    crcAnalog: "CRC Mode C field toggle",
  },
  {
    id: "altitude-filter",
    focus: "scope",
    windowsKeys: "F then 3-digit min, Enter, 3-digit max, Enter",
    action: "Altitude filter in Mode C hundreds. Esc cancels.",
    crcAnalog: "CRC altitude filter",
  },
  {
    id: "history-scope",
    focus: "scope",
    windowsKeys: "H",
    action: "History dots (same as F8: 0 ↔ last non-zero) when the PPI is focused.",
    crcAnalog: "DCB history (always-on duplicate is F8)",
  },
  {
    id: "radio-focus",
    focus: "scope",
    windowsKeys: "/",
    action:
      "Preview Area slew/drop prefix (buffers `/`). Tab cycles PPI ↔ command line. Radio-focused / types as phase 1.",
    crcAnalog:
      "CRC / is leader length — we do not bind that; CRC <SLEW> analog is / or canvas click",
  },
  {
    id: "stars-tpa-atpa",
    focus: "scope",
    windowsKeys: "* then J/P/D+/AE/BE/DE, Enter commits",
    action:
      "TPA/ATPA slew chord on the selected track (J-ring, cone, size/ATPA flags). Display only — never Command IR.",
    crcAnalog: "CRC STARS TPA/ATPA Table 36 (*J *P **J **P *D+ *AE *BE *DE)",
  },
];

export function isMouseBinding(binding: KeyBinding): boolean {
  return binding.id.startsWith("mouse-");
}

export function alwaysOnKeyBindings(): KeyBinding[] {
  return KEY_BINDINGS.filter((b) => b.focus === "always" && !isMouseBinding(b));
}

export function scopeFocusKeyBindings(): KeyBinding[] {
  return KEY_BINDINGS.filter((b) => b.focus === "scope");
}

export function mouseKeyBindings(): KeyBinding[] {
  return KEY_BINDINGS.filter(isMouseBinding);
}

export function bindingById(id: string): KeyBinding | undefined {
  return KEY_BINDINGS.find((b) => b.id === id);
}

export const SCOPE_CHORD_WINDOW_MS = 1500;
/** Chord window after L or F (phase README frozen decision 2). */
export const CHORD_TIMEOUT_MS = SCOPE_CHORD_WINDOW_MS;

/** Pending scope-focus chord (`L` leader; `F` filter). */
export interface ScopeChord {
  /** Prefix letter, uppercase. */
  prefix: string;
  startedAtMs: number;
  /** Optional status hint, e.g. `L_`. */
  hint: string;
  /** Digit buffer for multi-key chords (filter). Leader uses one digit. */
  buffer: string;
}

export function beginScopeChord(prefix: string, nowMs: number, hint: string): ScopeChord {
  return { prefix, startedAtMs: nowMs, hint, buffer: "" };
}

export function isScopeChordLive(chord: ScopeChord | null | undefined, nowMs: number): boolean {
  return chord != null && nowMs - chord.startedAtMs <= SCOPE_CHORD_WINDOW_MS;
}

/** Filter entry expires at exactly timeout (T02-06). Leader chord stays live through the window. */
export function chordTimedOut(
  lastKeyAtMs: number,
  nowMs: number,
  timeoutMs: number = CHORD_TIMEOUT_MS,
): boolean {
  return nowMs - lastKeyAtMs >= timeoutMs;
}

export function isArrowKey(key: string): boolean {
  return key === "ArrowUp" || key === "ArrowDown" || key === "ArrowLeft" || key === "ArrowRight";
}

/**
 * Top-row or numpad digit 0–9. Arrow keys (NumLock off) return null even when
 * `code` is Numpad8 etc. — require a real digit key.
 * `code` covers Digit/Numpad when `key` is not a digit character.
 * `key` may also be `Numpad3` (T02-06 filter chord).
 */
export function digitFromKey(key: string, code?: string): number | null {
  if (isArrowKey(key)) {
    return null;
  }
  if (/^[0-9]$/.test(key)) {
    return Number(key);
  }
  const fromKey = /^Numpad([0-9])$/.exec(key);
  if (fromKey) {
    return Number(fromKey[1]);
  }
  const fromCode = code?.match(/^(?:Digit|Numpad)([0-9])$/);
  if (fromCode) {
    return Number(fromCode[1]);
  }
  return null;
}

/** Scope-focus altitude filter chord. Never always-on. */
export function isFilterChordKey(key: string): boolean {
  return key === "F" || key === "f";
}

/** Scope-focus Table 30 beacon select. Never always-on; radio `B` is literal. */
export function isBeaconSelectKey(key: string): boolean {
  return key === "B" || key === "b";
}

/** Scope-focus STARS TPA/ATPA `*` chord. Never always-on; radio `*` is literal. */
export function isStarsChordPrefixKey(key: string): boolean {
  return key === "*" || key === "Multiply";
}

/**
 * Help overlay toggle: ? / Shift+/ (or Alt+F1). Plain F1 is INIT CNTL.
 */
export function isHelpToggleKey(
  event: { key: string; shiftKey?: boolean; altKey?: boolean; ctrlKey?: boolean } | string,
): boolean {
  if (typeof event === "string") {
    return event === "?" || event === "Help";
  }
  if (event.key === "?" || (event.key === "/" && event.shiftKey === true) || event.key === "Help") {
    return true;
  }
  if (event.key === "F1" && event.altKey === true) {
    return true;
  }
  return false;
}

/** Tab cycles command line ↔ PPI. Always-on except help overlay inputs. */
export function isCycleFocusKey(key: string): boolean {
  return key === "Tab";
}

/**
 * Unmodified slash. Scope-focused `/` buffers into the Preview Area (T02-61).
 * Radio-focused `/` is left to phase 1 (insert or no-op). Tab cycles focus.
 */
export function isRadioFocusSlashKey(key: string): boolean {
  return key === "/";
}

/**
 * Always-on handoff action. F5 (Table 18) or legacy Shift+H.
 * Auto-detects Tower (for arrivals on final) vs Center (for climbing departures).
 */
export function isHandoffKey(event: {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
}): boolean {
  if (event.key === "F5" && !event.ctrlKey) {
    return true;
  }
  return event.shiftKey === true && (event.key === "H" || event.key === "h");
}

export const isTowerHandoffKey = isHandoffKey;
