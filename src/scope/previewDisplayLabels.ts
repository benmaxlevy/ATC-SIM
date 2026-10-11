import { formatPreviewReadout, type PreviewAreaState } from "./previewArea";

const MNEMONIC_LABELS: ReadonlyArray<readonly [string, string]> = [
  ["INIT CNTL", "IC"],
  ["TERM CNTL", "TC"],
  ["FLT DATA", "DA"],
  ["MULTI FUNC", "F"],
  ["VFR DATA", "VP"],
];

/** STARS Table D-1 display abbreviations; raw preview state remains unchanged. */
export function formatPreviewDisplayReadout(state: PreviewAreaState): string | null {
  const readout = formatPreviewReadout(state);
  if (readout === null) return null;

  if (state.rejection !== null) return readout;

  const mnemonic = state.mnemonic;
  // RBL is an internal entry owner, not a manual-specified Preview prompt.
  // After endpoint 1, echo only the operand being entered for endpoint 2.
  if (mnemonic === "RBL") return state.buffer || null;

  const label = MNEMONIC_LABELS.find(([known]) => mnemonic === known)?.[1];
  if (label !== undefined && (readout === mnemonic || readout.startsWith(`${mnemonic} `))) {
    return `${label}${readout.slice(mnemonic.length)}`;
  }

  if (
    /^F7 (?:[RQVB]|L[1-9](?: \S+)?)$/.test(mnemonic) &&
    (readout === mnemonic || readout.startsWith(`${mnemonic} `))
  ) {
    return `F${mnemonic.slice(2)}${readout.slice(mnemonic.length)}`;
  }

  return readout;
}
