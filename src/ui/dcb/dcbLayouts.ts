export type DcbCellKind = "action" | "toggle" | "spinner" | "submenu" | "disabled";

export interface MainDcbLayoutCell {
  id: string;
  row: 1 | 2;
  column: number;
  rowSpan: 1 | 2;
  kind: DcbCellKind;
  label: string;
  value?: string;
}

/**
 * Analog: CRC STARS MAIN DCB physical column grammar (R07).
 * Trainer delta: fixed two-row, 22-column projection; quick maps are authored
 * six-map controls rather than a full NAS video-map host.
 */
export const MAIN_DCB_LAYOUT: readonly MainDcbLayoutCell[] = [
  { id: "range", row: 1, column: 1, rowSpan: 2, kind: "spinner", label: "RANGE" },
  { id: "place-cntr", row: 1, column: 2, rowSpan: 1, kind: "toggle", label: "PLACE CNTR" },
  { id: "off-cntr", row: 2, column: 2, rowSpan: 1, kind: "toggle", label: "OFF CNTR" },
  { id: "rr", row: 1, column: 3, rowSpan: 2, kind: "spinner", label: "RR" },
  { id: "place-rr", row: 1, column: 4, rowSpan: 1, kind: "toggle", label: "PLACE RR" },
  { id: "rr-cntr", row: 2, column: 4, rowSpan: 1, kind: "toggle", label: "RR CNTR" },
  { id: "maps", row: 1, column: 5, rowSpan: 2, kind: "submenu", label: "MAPS" },
  ...Array.from({ length: 6 }, (_, index): MainDcbLayoutCell => ({
    id: `map-${index + 1}`,
    row: index < 3 ? 1 : 2,
    column: 6 + (index % 3),
    rowSpan: 1,
    kind: "toggle",
    label: `MAP ${index + 1}`,
  })),
  ...Array.from({ length: 6 }, (_, index): MainDcbLayoutCell => ({
    id: `wx${index + 1}`,
    row: 1,
    column: 9 + index,
    rowSpan: 2,
    kind: "toggle",
    label: `WX${index + 1}`,
  })),
  { id: "brite", row: 1, column: 15, rowSpan: 2, kind: "submenu", label: "BRITE" },
  { id: "ldr-dir", row: 1, column: 16, rowSpan: 1, kind: "spinner", label: "LDR DIR" },
  { id: "ldr-length", row: 2, column: 16, rowSpan: 1, kind: "spinner", label: "LDR" },
  { id: "char", row: 1, column: 17, rowSpan: 2, kind: "submenu", label: "CHAR SIZE" },
  { id: "mode-fsl", row: 1, column: 18, rowSpan: 2, kind: "disabled", label: "MODE FSL" },
  { id: "pref", row: 1, column: 19, rowSpan: 2, kind: "submenu", label: "PREF" },
  { id: "site-fused", row: 1, column: 20, rowSpan: 2, kind: "submenu", label: "SITE FUSED" },
  { id: "ssa-filter", row: 1, column: 21, rowSpan: 1, kind: "submenu", label: "SSA FILTER" },
  { id: "gi-text", row: 2, column: 21, rowSpan: 1, kind: "submenu", label: "GI TEXT FILTER" },
  { id: "shift", row: 1, column: 22, rowSpan: 2, kind: "action", label: "SHIFT" },
];
