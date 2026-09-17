/**
 * Analog: CRC STARS keyboard / DCB (docs.virtualnas.net/crc/stars — R07).
 * CRC F1 = INIT CNTL; F3 = Track Suspend;
 * L1–L9 = leader direction; DCB RANGE spinner; PTL OWN/ALL; `/` = leader
 * length. vice (R08) is typed-radio feel, not this map.
 * Trainer delta: exported Windows subset only — Help is `?` / the Help button,
 * F3 Track Suspend is reserved/no-op for now, PageUp/Down range presets 5–512 (no CRC 6/8/12/16/24), `/` when
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
  /** Binding ids are projected from KEY_BINDINGS; no help rows are copied here. */
  bindingSections: HelpBindingSection[];
}

export interface HelpBindingSection {
  id: string;
  title: string;
  bindingIds: string[];
}

/** User-facing command reference shared by the Help menu and tests. */
export const HELP_COMMAND_GROUPS: HelpCommandGroup[] = [
  {
    id: "radio",
    title: "Radio clearances",
    entries: [
      {
        id: "heading",
        command: "H <heading>",
        example: "H270",
        input: "Radio",
        result: "Turns left or right to the heading.",
      },
      {
        id: "altitude",
        command: "C <altitude>",
        example: "C30",
        input: "Radio",
        result: "Climbs or descends to the altitude.",
      },
      {
        id: "speed",
        command: "S <knots>",
        example: "S210",
        input: "Radio",
        result: "Sets the aircraft speed.",
      },
      {
        id: "squawk",
        command: "SQ <code> / SQ VFR",
        example: "DAL123 SQ 4721 / SQ VFR",
        input: "Radio",
        result:
          "Assigns a four-digit octal beacon code; VFR assigns 1200. The pilot report is delayed.",
      },
      {
        id: "maintain-vfr",
        command: "MVFR",
        example: "DAL123 MVFR",
        input: "Radio",
        result:
          "Marks the aircraft to maintain VFR and reads back maintain VFR; no IFR clearance, route, or plan activation.",
      },
      {
        id: "ifr-clearance",
        command: "CLR TO <LIMIT> <ASFILED|VIA ...> [ALT] [CVIA] [FREQ] [SQ]",
        example: "DAL123 CLR TO KAHN VIA DIRECT",
        input: "Radio",
        result:
          "Issues one atomic IFR clearance. For an airborne ambient VFR aircraft with an open IFR pickup request, grants an atomic transition to operational IFR to an eligible regional controlled airport via RADAR VECTORS or catalog route. Every VIA element must match a catalog FIX/NAVAID or procedure using its id, alias/name, spoken folding, or a unique one-edit match. Local parsing does not apply distance-two repairs. DIRECT is optional between elements and missing markers mean direct. If local parsing misses, trainer-only Path C may choose one unique listed candidate per supplied transcript span, including a unique distance-two retrieval candidate. Unknown, unlisted, tied, incomplete, concatenated, or airport route elements are PARSE_MISS and read back unable. It never invents route legs. Tactical CLEARED/PROCEED DIRECT never resets the plan.",
      },
      {
        id: "approach",
        command: "A <approach>",
        example: "A ILS27",
        input: "Radio",
        result: "Issues a supported approach clearance.",
      },
      {
        id: "visual-approach",
        command: "VIS <runway> / cleared visual approach runway <runway>",
        example: "DAL123 VIS 27L",
        input: "Radio",
        result:
          "Clears the aircraft for a visual approach to the designated runway at its destination airport. Guides straight-in with a 3° descent to touchdown.",
      },
      {
        id: "cancel-approach",
        command: "CAPP / cancel approach clearance",
        example: "DAL123 CAPP H270 A50",
        input: "Radio",
        result:
          "Cancels active approach guidance, then accepts ordinary vectors. It does not cancel IFR clearance or start the missed approach; no approach re-arm may follow in the same transmission.",
      },
      {
        id: "say-request",
        command: "say request",
        example: "DAL123 say request",
        input: "Radio",
        result: "Requests flight following or route details from the pilot.",
      },
      {
        id: "standby-request",
        command: "stand by",
        example: "DAL123 stand by",
        input: "Radio",
        result: "Tells the pilot to standby on their radio request.",
      },
      {
        id: "approve-flight-following",
        command: "approve flight following",
        example: "DAL123 approve flight following",
        input: "Radio",
        result: "Approves VFR flight following for a radar-identified aircraft.",
      },
      {
        id: "decline-request",
        command: "unable flight following",
        example: "DAL123 unable flight following",
        input: "Radio",
        result: "Declines an open flight-following request.",
      },
      {
        id: "radar-contact",
        command: "radar contact [<N> miles [direction] from|of <fix|navaid|airport>]",
        example: "DAL123 radar contact 25 miles southeast of KATL",
        input: "Radio",
        result:
          "Establishes radar identification; the position report is optional and the pilot answers roger.",
      },
      {
        id: "terminate-radar-service",
        command: "radar service terminated",
        example: "DAL123 radar service terminated",
        input: "Radio",
        result: "Terminates radar advisory service; squawk is not automatically reset to 1200.",
      },
      {
        id: "acknowledge-ifr-cancellation",
        command: "IFR cancellation received",
        example: "DAL123 IFR cancellation received",
        input: "Radio",
        result:
          "Acknowledges pilot-initiated IFR cancellation, reverting flight rules to VFR outside Class B.",
      },
      {
        id: "callsign",
        command: "<callsign> <instructions>",
        example: "DAL123 H270",
        input: "Radio",
        result: "Applies instructions to one aircraft.",
      },
    ],
  },
  {
    id: "preview",
    title: "Aircraft commands",
    entries: [
      {
        id: "init",
        command: "F1 / +",
        example: "F1, identity, then click",
        input: "PPI or Preview Area",
        result: "Initiates or associates the selected track.",
      },
      {
        id: "suspend",
        command: "F3",
        example: "F3",
        input: "Always-on key",
        result: "Does nothing.",
      },
      {
        id: "terminate",
        command: "F4",
        example: "F4, then click",
        input: "PPI or Preview Area",
        result: "Terminates the selected track.",
      },
      {
        id: "multi",
        command: "F7 / *",
        example: "*T",
        input: "PPI or Preview Area",
        result: "Starts a Preview command.",
      },
      {
        id: "tracking",
        command: "*L1–*L9",
        example: "*L8, then click",
        input: "Preview Area",
        result: "Sets the selected track's leader direction.",
      },
    ],
  },
  {
    id: "flight-plans",
    title: "Flight plans",
    entries: [
      {
        id: "flt-data",
        command: "F6 / FLT DATA <ACID> [fields]",
        example: "F6 UAL1234 ENTER; F6 UAL1234 A ENTER",
        input: "Any focus, then Preview Area",
        result:
          "Creates a local IFR flight plan. An omitted beacon uses the configured default pool (or no code); A explicitly means no assigned beacon. Use +, /, /1-/4 for pool selectors; Δ<text> and +<text> set scratchpads.",
      },
      {
        id: "vfr-data",
        command: "F9 / VFR DATA",
        example: "F9 N123AB KDEM*RW27 ΔVFR C172 050 Enter",
        input: "Any focus, then Preview Area",
        result:
          "Creates, edits, or deletes a local VFR plan; Δ<text> sets scratchpad 1 and +<text> sets scratchpad 2.",
      },
      {
        id: "plan-create",
        command: "<ACID> [fields]",
        example: "UAL1234 2341 AT B738",
        input: "Preview Area",
        result:
          "Creates a pending local flight plan. An omitted beacon uses the configured default pool or no code; A explicitly means no assigned beacon; +, /, and /1-/4 select configured pools.",
      },
      {
        id: "plan-pending-discrete",
        command: "F1 / INIT CNTL <ACID> <beacon> [fields]",
        example: "F1 UAL1234 2341, then click",
        input: "INIT CNTL Preview path",
        result: "Creates a pending discrete flight plan.",
      },
      {
        id: "plan-modify",
        command: "*M <identity> <data>",
        example: "*M 14 5252",
        input: "Preview Area",
        result: "Modifies a flight plan.",
      },
      {
        id: "plan-delete",
        command: "*DEL <index>",
        example: "*DEL14",
        input: "Preview Area",
        result: "Deletes a flight plan.",
      },
      {
        id: "plan-beacon",
        command: "*B <identity>",
        example: "*B UAL1234",
        input: "Preview Area",
        result: "Releases the assigned beacon.",
      },
      {
        id: "plan-modal",
        command: "*FP <ACID> Enter",
        example: "*FP AAL123 Enter or *FP Enter, then click",
        input: "Any focus → Preview Area",
        result: "Opens a filed flight-plan dialog.",
      },
    ],
  },
  {
    id: "scope",
    title: "Datablocks and filters",
    entries: [
      {
        id: "range",
        command: "PageUp / PageDown",
        example: "PageUp",
        input: "Any focus",
        result: "Changes the range preset.",
      },
      {
        id: "center",
        command: "Home / End",
        example: "Home",
        input: "Any focus",
        result: "Centers on the airport or last PPI click.",
      },
      {
        id: "datablock",
        command: "T",
        example: "T",
        input: "PPI",
        result: "Toggles full or limited datablocks.",
      },
      {
        id: "mode-c",
        command: "M",
        example: "M",
        input: "PPI",
        result: "Toggles Mode C.",
      },
      {
        id: "filter",
        command: "F <min> Enter <max> Enter",
        example: "F030 Enter 180 Enter",
        input: "PPI",
        result: "Sets the altitude filter.",
      },
      {
        id: "history",
        command: "H / F8",
        example: "H",
        input: "PPI or any focus",
        result: "Toggles history dots.",
      },
    ],
  },
  {
    id: "display",
    title: "View and maps",
    entries: [
      {
        id: "scope-center",
        command: "*C / *OFF",
        example: "*C, then click",
        input: "Preview Area",
        result: "Places or resets the view center.",
      },
      {
        id: "range-rings",
        command: "*RR <NM> / *RR CNTR",
        example: "*RR10",
        input: "Preview Area",
        result: "Sets or centers the range rings.",
      },
      {
        id: "ptl",
        command: "*PTL <minutes> / *R",
        example: "*PTL5",
        input: "Preview Area",
        result: "Sets PTL or arms per-track PTL.",
      },
      {
        id: "hist",
        command: "*HIST <count>",
        example: "*HIST5",
        input: "Preview Area",
        result: "Sets the history-dot count.",
      },
      {
        id: "weather",
        command: "*WX <level> / *WX ALL / *WX OFF",
        example: "*WX3",
        input: "Preview Area",
        result: "Toggles a weather level.",
      },
      {
        id: "maps",
        command: "*D <map> / *D ALL / *D NONE",
        example: "*D DEM1_27",
        input: "Preview Area",
        result: "Toggles a video map or all maps.",
      },
      {
        id: "altitude",
        command: "*F / *FC / *LA <floor><ceiling>",
        example: "*F030180 or *LA030180",
        input: "Preview Area",
        result: "Displays or sets altitude filters.",
      },
      {
        id: "beacon-filter",
        command: "*BCN <code>",
        example: "*BCN45",
        input: "Preview Area",
        result: "Adds or removes a beacon filter.",
      },
    ],
  },
  {
    id: "lists",
    title: "System lists",
    entries: [
      {
        id: "lists",
        command: "*S, *T, *TV, *TM, *TC, *TS, *TX, *TN, *P1–*P3",
        example: "*T15",
        input: "Preview Area",
        result: "Opens or manages system lists.",
      },
      {
        id: "tab-list",
        command: "*T [lines]",
        example: "*T15",
        input: "Preview Area",
        result: "Toggles or resizes the TAB list.",
      },
      {
        id: "tower-list",
        command: "*P1–*P3 [lines]",
        example: "*P1",
        input: "Preview Area",
        result: "Toggles or resizes a tower list.",
      },
      {
        id: "vfr-list",
        command: "*TV [lines]",
        example: "*TV",
        input: "Preview Area",
        result: "Toggles or resizes the VFR list.",
      },
      {
        id: "maps-list",
        command: "*TX",
        example: "*TX",
        input: "Preview Area",
        result: "Toggles or relocates the video-map list.",
      },
      {
        id: "alert-list",
        command: "*TM",
        example: "*TM",
        input: "Preview Area",
        result: "Toggles or relocates the alert list.",
      },
      {
        id: "coast-list",
        command: "*TC [lines]",
        example: "*TC",
        input: "Preview Area",
        result: "Toggles or resizes the coast list.",
      },
      {
        id: "sign-on-list",
        command: "*TS",
        example: "*TS",
        input: "Preview Area",
        result: "Toggles or relocates the sign-on list.",
      },
      {
        id: "ssa-list",
        command: "*S",
        example: "*S, then click",
        input: "Preview Area",
        result: "Relocates the system status list.",
      },
      {
        id: "crda-list",
        command: "*TN",
        example: "*TN",
        input: "Preview Area",
        result: "Toggles or relocates the CRDA list.",
      },
    ],
  },
  {
    id: "tracking-alerts",
    title: "Alerts and tracking",
    entries: [
      {
        id: "force-fdb",
        command: "*F / **F",
        example: "*F, then click; **F",
        input: "Preview Area",
        result: "Forces or clears full datablocks.",
      },
      {
        id: "leader",
        command: "+ / /<FLID> / *L1–*L9 / *0 / *1–*8",
        example: "+, then click; *L8, then click",
        input: "Preview Area",
        result: "Initiates, terminates, or sets leader direction.",
      },
      {
        id: "leader-length",
        command: "*LDR <0–7>",
        example: "*LDR4",
        input: "Preview Area",
        result: "Sets the default leader length.",
      },
      {
        id: "ca",
        command: "CA / CA K / CA P / CA C",
        example: "CA K 14; CA P 14 18; CA C I",
        input: "Preview Area",
        result: "Runs conflict-alert controls.",
      },
      {
        id: "msaw",
        command: "*Q / *V",
        example: "*Q, then click",
        input: "Preview Area",
        result: "Inhibits the current alert or toggles MSAW.",
      },
      {
        id: "mci",
        command: "*MCI",
        example: "*MCI",
        input: "Preview Area",
        result: "Toggles beacon-code mismatch inhibit.",
      },
      {
        id: "beacon-select",
        command: "B<2 or 4 octal digits>",
        example: "B45 or B4501",
        input: "PPI or Preview Area",
        result: "Selects a beacon block or discrete code.",
      },
    ],
  },
  {
    id: "focus",
    title: "Focus and Preview Area",
    entries: [
      {
        id: "tab",
        command: "Tab",
        example: "Tab",
        input: "Any focus",
        result: "Cycles command-line and PPI focus.",
      },
      {
        id: "slash",
        command: "/",
        example: "/",
        input: "PPI",
        result: "Starts a Preview Area slew or drop command.",
      },
      {
        id: "radio-conflict",
        command: "L090",
        example: "L090",
        input: "Command line",
        result: "Turns left to heading 090.",
      },
    ],
  },
  {
    id: "navigation",
    title: "Help, cancel, and navigation",
    entries: [
      {
        id: "escape",
        command: "Escape",
        example: "Esc",
        input: "Any focus",
        result: "Cancels active input or closes Help.",
      },
    ],
  },
];

/**
 * Task-based navigation keeps the command list scannable without hiding detail.
 * Each binding is assigned once and rendered by looking up its id in
 * KEY_BINDINGS, so keyboard and mouse copy cannot drift from behavior.
 */
export const HELP_NAVIGATION_GROUPS: HelpNavigationGroup[] = [
  {
    id: "aircraft",
    title: "Aircraft & flight plans",
    commandGroupIds: ["radio", "preview", "flight-plans", "tracking-alerts"],
    bindingSections: [
      {
        id: "aircraft-keyboard",
        title: "Aircraft keyboard controls",
        bindingIds: ["initiate-track", "flt-data", "track-suspend", "drop-track", "tower-handoff"],
      },
      {
        id: "aircraft-alerts",
        title: "Alerts and tracking controls",
        bindingIds: ["ca-inhibit"],
      },
      {
        id: "aircraft-mouse",
        title: "Aircraft actions on the PPI",
        bindingIds: ["mouse-select", "mouse-accept-handoff", "mouse-deselect"],
      },
    ],
  },
  {
    id: "scope",
    title: "Scope & display",
    commandGroupIds: ["scope", "display"],
    bindingSections: [
      {
        id: "scope-view",
        title: "View and map controls",
        bindingIds: [
          "range-in",
          "range-out",
          "center-airport",
          "center-click",
          "mouse-range",
          "mouse-pan",
          "mouse-center",
          "mouse-place-cntr",
          "mouse-place-rr",
        ],
      },
      {
        id: "scope-datablocks",
        title: "Datablocks and filters",
        bindingIds: ["history", "ptl", "datablock", "mode-c", "altitude-filter", "history-scope"],
      },
      {
        id: "scope-dcb",
        title: "Display Control Bar",
        bindingIds: [
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
        ],
      },
    ],
  },
  {
    id: "workstation",
    title: "Workstation & trainer controls",
    commandGroupIds: ["focus", "navigation", "lists"],
    bindingSections: [
      {
        id: "workstation-preview",
        title: "Focus and Preview Area",
        bindingIds: ["cycle-focus", "radio-focus", "stars-tpa-atpa", "multi-func"],
      },
      {
        id: "workstation-navigation",
        title: "Help, cancel, and navigation",
        bindingIds: ["help"],
      },
    ],
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
    action: "Moves to a smaller range.",
    crcAnalog: "DCB RANGE spinner / Ctrl+F10 RANGE",
  },
  {
    id: "range-out",
    focus: "always",
    windowsKeys: "PageDown",
    action: "Moves to a larger range.",
    crcAnalog: "DCB RANGE spinner / Ctrl+F10 RANGE",
  },
  {
    id: "center-airport",
    focus: "always",
    windowsKeys: "Home",
    action: "Centers on the airport.",
    crcAnalog: "CENTER then click / Ctrl+F1 re-center",
  },
  {
    id: "center-click",
    focus: "always",
    windowsKeys: "End",
    action: "Centers on the last PPI click.",
    crcAnalog: "CENTER then click",
  },
  {
    id: "help",
    focus: "always",
    windowsKeys: "? / Shift+/ / Help button (or Alt+F1)",
    action: "Opens or closes Help.",
    crcAnalog: "Trainer help (? / Shift+/ / Help button / Alt+F1)",
  },
  {
    id: "initiate-track",
    focus: "always",
    windowsKeys: "F1",
    action: "INIT CNTL initiates selected target or arms command-then-slew.",
    crcAnalog: "F1 <INIT CNTL>",
  },
  {
    id: "flt-data",
    focus: "always",
    windowsKeys: "F6",
    action: "Opens full IFR FLT DATA entry.",
    crcAnalog: "F6 <FLT DATA>",
  },
  {
    id: "track-suspend",
    focus: "always",
    windowsKeys: "F3",
    action: "Does nothing.",
    crcAnalog: "F3 <TRK SUSP>",
  },
  {
    id: "drop-track",
    focus: "always",
    windowsKeys: "F4",
    action: "Terminates the selected or armed track.",
    crcAnalog: "F4 TERM CNTL / <TERM CNTL><SLEW> / <TERM CNTL><FLID><ENTER>",
  },
  {
    id: "tower-handoff",
    focus: "always",
    windowsKeys: "F5 (or Shift+H)",
    action: "Starts a handoff.",
    crcAnalog: "F5 <HND OFF> (or Shift+H)",
  },
  {
    id: "multi-func",
    focus: "always",
    windowsKeys: "F7",
    action: "Starts a Preview command.",
    crcAnalog: "F7 <MULTI FUNC>",
  },
  {
    id: "history",
    focus: "always",
    windowsKeys: "F8",
    action: "Toggles history dots.",
    crcAnalog: "F8 <HIST>",
  },
  {
    id: "ptl",
    focus: "always",
    windowsKeys: "F10",
    action: "Toggles PTL ALL.",
    crcAnalog: "F10 <PTL>",
  },
  {
    id: "ca-inhibit",
    focus: "always",
    windowsKeys: "F11",
    action: "Starts a CA command.",
    crcAnalog: "F11 <CA>",
  },
  {
    id: "dcb-maps",
    focus: "always",
    windowsKeys: "Ctrl+F2",
    action: "Opens DCB MAPS.",
    crcAnalog: "Ctrl+F2 <MAPS>",
  },
  {
    id: "dcb-brite",
    focus: "always",
    windowsKeys: "Ctrl+F3",
    action: "Opens DCB BRITE.",
    crcAnalog: "Ctrl+F3 <BRITE>",
  },
  {
    id: "dcb-ldr",
    focus: "always",
    windowsKeys: "Ctrl+F4",
    action: "Opens DCB LDR.",
    crcAnalog: "Ctrl+F4 <LDR>",
  },
  {
    id: "dcb-char-size",
    focus: "always",
    windowsKeys: "Ctrl+F5",
    action: "Opens DCB CHAR SIZE.",
    crcAnalog: "Ctrl+F5 <CHAR SIZE>",
  },
  {
    id: "dcb-shift",
    focus: "always",
    windowsKeys: "Ctrl+F7",
    action: "Toggles DCB MAIN and AUX.",
    crcAnalog: "Ctrl+F7 <SHIFT>",
  },
  {
    id: "dcb-toggle",
    focus: "always",
    windowsKeys: "Ctrl+F8",
    action: "Toggles DCB visibility.",
    crcAnalog: "Ctrl+F8 <DCB>",
  },
  {
    id: "dcb-rng-ring",
    focus: "always",
    windowsKeys: "Ctrl+F9",
    action: "Opens the DCB range-ring spinner.",
    crcAnalog: "Ctrl+F9 <RNG RING>",
  },
  {
    id: "dcb-range",
    focus: "always",
    windowsKeys: "Ctrl+F10",
    action: "Opens the DCB range spinner.",
    crcAnalog: "Ctrl+F10 <RANGE>",
  },
  {
    id: "dcb-wx",
    focus: "always",
    windowsKeys: "Ctrl+F11",
    action: "Toggles weather layers.",
    crcAnalog: "Ctrl+F11 <WX>",
  },
  {
    id: "dcb-pref",
    focus: "always",
    windowsKeys: "Insert (Ins)",
    action: "Opens DCB PREF.",
    crcAnalog: "Ins <PREF SET>",
  },
  {
    id: "cycle-focus",
    focus: "always",
    windowsKeys: "Tab",
    action: "Cycles command-line and PPI focus.",
    crcAnalog: "Not CRC — trainer radio vs scope focus",
  },
  {
    id: "mouse-range",
    focus: "always",
    windowsKeys: "Wheel up / down",
    action: "Changes the range.",
    crcAnalog: "DCB RANGE spinner wheel",
  },
  {
    id: "mouse-pan",
    focus: "always",
    windowsKeys: "Right-button drag (middle-button still works)",
    action: "Moves the view center.",
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
    action: "Accepts the inbound handoff.",
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
    action: "Sets the view center.",
    crcAnalog: "DCB PLACE CNTR then click",
  },
  {
    id: "mouse-place-rr",
    focus: "always",
    windowsKeys: "DCB PLACE RR, then PPI click",
    action: "Sets the range-ring origin.",
    crcAnalog: "DCB PLACE RR then click",
  },
  {
    id: "datablock",
    focus: "scope",
    windowsKeys: "T",
    action: "Toggles full or limited datablocks.",
    crcAnalog: "Tag/untag analog (FDB / LDB)",
  },
  {
    id: "mode-c",
    focus: "scope",
    windowsKeys: "M",
    action: "Toggles Mode C.",
    crcAnalog: "CRC Mode C field toggle",
  },
  {
    id: "altitude-filter",
    focus: "scope",
    windowsKeys: "F then 3-digit min, Enter, 3-digit max, Enter",
    action: "Sets the altitude filter.",
    crcAnalog: "CRC altitude filter",
  },
  {
    id: "history-scope",
    focus: "scope",
    windowsKeys: "H",
    action: "Toggles history dots.",
    crcAnalog: "DCB history (always-on duplicate is F8)",
  },
  {
    id: "radio-focus",
    focus: "scope",
    windowsKeys: "/",
    action: "Starts a Preview Area slew or drop command.",
    crcAnalog:
      "CRC / is leader length — we do not bind that; CRC <SLEW> analog is / or canvas click",
  },
  {
    id: "stars-tpa-atpa",
    focus: "scope",
    windowsKeys: "* then J/P/D+/AE/BE/DE, Enter commits",
    action: "Runs a TPA or ATPA command.",
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
