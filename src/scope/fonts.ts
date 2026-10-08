/**
 * Fonts converted from Vice's STARS bitmaps (GPL-3.0-only).
 * Stored CHAR SIZE values remain compatibility tokens; each selects an authored
 * bitmap face at its native cell height. No outline scaling or synthetic weight.
 */
import viceMetrics from "./viceFontMetrics.json";

export const FALLBACK_SCOPE_FONT_STACK =
  'ui-monospace, "Cascadia Mono", Consolas, "Liberation Mono", monospace';
export const SCOPE_FONT_STACK = `"Vice ARTS 4", ${FALLBACK_SCOPE_FONT_STACK}`;

const failedFonts = new Set<string>();
let loading: Promise<void> | undefined;
let fontsReady = typeof document === "undefined" || !document.fonts;

export function scopeFontsReady(): boolean {
  return fontsReady;
}

/** All runtime faces settle before scope measurement. Failure uses system mono. */
export function loadScopeFonts(
  fontSet: Pick<FontFaceSet, "load"> | undefined = globalThis.document?.fonts,
  timeoutMs = 5000,
): Promise<void> {
  if (loading) return loading;
  if (!fontSet) {
    for (const asset of viceMetrics) failedFonts.add(asset.cssFamily);
    fontsReady = true;
    return Promise.resolve();
  }
  fontsReady = false;
  loading = Promise.all(
    viceMetrics
      .filter((asset) => asset.family === "arts")
      .map(async (asset) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const faces = await Promise.race([
            fontSet.load(`${asset.height}px "${asset.cssFamily}"`, "0Δ▲▼□"),
            new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error("Scope font load timeout")), timeoutMs);
            }),
          ]);
          if (faces.length === 0) failedFonts.add(asset.cssFamily);
        } catch {
          failedFonts.add(asset.cssFamily);
        } finally {
          clearTimeout(timer);
        }
      }),
  ).then(() => {
    fontsReady = true;
  });
  return loading;
}

export function scopeFontAsset(level: number) {
  const size = Math.max(0, Math.min(5, Math.round(level)));
  const asset = viceMetrics.find((entry) => entry.size === size);
  if (!asset) throw new Error(`Missing Vice ARTS font ${size}`);
  return asset;
}

export function scopeFontStack(level: number): string {
  const asset = scopeFontAsset(level);
  return failedFonts.has(asset.cssFamily)
    ? FALLBACK_SCOPE_FONT_STACK
    : `"${asset.cssFamily}", ${FALLBACK_SCOPE_FONT_STACK}`;
}

/** POS uses a smaller native face; levels 0 and 1 share the smallest asset. */
export function positionFontLevel(sizePx: number): number {
  return Math.max(0, sizePx - 5);
}

/** DCB values 10/11/12 represent levels 0/1/2. */
export function dcbFontStyle(size: number) {
  const level = size - 10;
  return {
    fontFamily: scopeFontStack(level),
    fontSize: scopeFontAsset(level).height,
  };
}

/** Historical preference token for default CHAR SIZE level 4. */
export const DATABLOCK_FONT_PX = 12;

/**
 * CHAR SIZE DATA BLOCKS/LISTS/TOOLS levels 0–5, stored as historical px tokens; select authored faces.
 * Readouts show levels; state keeps compatibility tokens.
 */
export const CHAR_SIZE_STEPS_PX = [8, 9, 10, 11, 12, 13] as const;
export type CharSizePx = (typeof CHAR_SIZE_STEPS_PX)[number];
export const DEFAULT_CHAR_SIZE_PX: CharSizePx = 12;

/**
 * DCB cell text. Native text fits the shipped 80 px DCB.
 * CHAR SIZE DCB levels 0–2, stored as historical 10/11/12 tokens; select authored faces.
 */
export const DCB_CHAR_SIZE_STEPS_PX = [10, 11, 12] as const;
export type DcbCharSizePx = (typeof DCB_CHAR_SIZE_STEPS_PX)[number];
export const DEFAULT_DCB_CHAR_SIZE_PX: DcbCharSizePx = 11;

/**
 * CHAR SIZE POS levels 0–5, mapped to discrete CSS px, not a sprite scale.
 * Default level 4 keeps existing 8 px symbols.
 */
export const POS_SIZE_STEPS_PX = [4, 5, 6, 7, 8, 9] as const;
export type PosSizePx = (typeof POS_SIZE_STEPS_PX)[number];
export const DEFAULT_POS_SIZE_PX: PosSizePx = 8;

export type CharSizeChannel = "dataBlocks" | "lists" | "dcb" | "tools" | "pos";

export interface CharSizes {
  /** FDB/LDB font px. */
  dataBlocks: CharSizePx;
  /** SSA + on-PPI strip list. */
  lists: CharSizePx;
  /** DCB cell text. */
  dcb: DcbCharSizePx;
  /** PTL cap tick / range-ring labels if any; else PTL-adjacent tools. */
  tools: CharSizePx;
  /** Position-symbol diamond px. */
  pos: PosSizePx;
}

export const DEFAULT_CHAR_SIZES: CharSizes = {
  dataBlocks: DEFAULT_CHAR_SIZE_PX,
  lists: DEFAULT_CHAR_SIZE_PX,
  dcb: DEFAULT_DCB_CHAR_SIZE_PX,
  tools: DEFAULT_CHAR_SIZE_PX,
  pos: DEFAULT_POS_SIZE_PX,
};

/** Migrate old level 6 to 5; missing/malformed preference fields use defaults. */
export function cloneCharSizes(
  sizes: Partial<Record<keyof CharSizes, number>> = DEFAULT_CHAR_SIZES,
): CharSizes {
  function read<T extends number>(steps: readonly T[], value: unknown, fallback: T): T {
    if (steps.includes(value as T)) return value as T;
    if (value === steps[steps.length - 1]! + 1) return steps[steps.length - 1]!;
    return fallback;
  }
  return {
    dataBlocks: read(CHAR_SIZE_STEPS_PX, sizes?.dataBlocks, DEFAULT_CHAR_SIZE_PX),
    lists: read(CHAR_SIZE_STEPS_PX, sizes?.lists, DEFAULT_CHAR_SIZE_PX),
    dcb: read(DCB_CHAR_SIZE_STEPS_PX, sizes?.dcb, DEFAULT_DCB_CHAR_SIZE_PX),
    tools: read(CHAR_SIZE_STEPS_PX, sizes?.tools, DEFAULT_CHAR_SIZE_PX),
    pos: read(POS_SIZE_STEPS_PX, sizes?.pos, DEFAULT_POS_SIZE_PX),
  };
}

/** Character-cell line box; matches font size so Mode C columns stack. */
export const DATABLOCK_LINE_HEIGHT_PX = scopeFontAsset(DATABLOCK_FONT_PX - 8).height;

export const DATABLOCK_FONT = datablockFontCss(DATABLOCK_FONT_PX);

export function datablockFontCss(sizePx: number = DATABLOCK_FONT_PX): string {
  const level = sizePx - 8;
  return `${scopeFontAsset(level).height}px ${scopeFontStack(level)}`;
}

export function datablockLineHeightPx(sizePx: number = DATABLOCK_FONT_PX): number {
  return scopeFontAsset(sizePx - 8).height;
}

/**
 * Fallback when Canvas `measureText("0")` is 0 (jsdom / tests).
 * Native ARTS default advance when canvas measurement is unavailable.
 */
export const DEFAULT_DATABLOCK_CELL_PX = scopeFontAsset(DATABLOCK_FONT_PX - 8).advances[48]!;

export function measureDatablockCellWidth(ctx: {
  measureText(text: string): { width: number };
}): number {
  const width = ctx.measureText("0").width;
  return width > 0 ? width : DEFAULT_DATABLOCK_CELL_PX;
}
