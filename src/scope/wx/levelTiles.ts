/**
 * Per-VIP STARS tiles. Drop `testdata/wx/levels/wx1.png` … `wx6.png`.
 * Paint samples them in screen space from one origin so marks stay aligned.
 */

import wx1Url from "../../../testdata/wx/levels/wx1.png";
import wx2Url from "../../../testdata/wx/levels/wx2.png";
import wx3Url from "../../../testdata/wx/levels/wx3.png";
import wx4Url from "../../../testdata/wx/levels/wx4.png";
import wx5Url from "../../../testdata/wx/levels/wx5.png";
import wx6Url from "../../../testdata/wx/levels/wx6.png";
import { decodePngToRgba, isPng } from "./png";

export const WX_LEVEL_TILE_URLS: readonly [string, string, string, string, string, string] = [
  wx1Url,
  wx2Url,
  wx3Url,
  wx4Url,
  wx5Url,
  wx6Url,
];

export interface WxLevelTile {
  width: number;
  height: number;
  rgba: Uint8Array;
}

let tiles: Array<WxLevelTile | null> = [null, null, null, null, null, null];
let tilesGen = 0;
let settled = false;
let inFlight: Promise<void> | undefined;

export function wxLevelTilesGeneration(): number {
  return tilesGen;
}

export function getWxLevelTile(level: 1 | 2 | 3 | 4 | 5 | 6): WxLevelTile | null {
  return tiles[level - 1] ?? null;
}

/** Screen-space sample. Same origin for every level. */
export function sampleWxLevelTile(
  level: 1 | 2 | 3 | 4 | 5 | 6,
  screenX: number,
  screenY: number,
): [number, number, number] | null {
  const tile = tiles[level - 1];
  if (!tile || tile.width <= 0 || tile.height <= 0) {
    return null;
  }
  const x = ((Math.floor(screenX) % tile.width) + tile.width) % tile.width;
  const y = ((Math.floor(screenY) % tile.height) + tile.height) % tile.height;
  const o = (y * tile.width + x) * 4;
  if ((tile.rgba[o + 3] ?? 0) < 8) {
    return null;
  }
  return [tile.rgba[o] ?? 0, tile.rgba[o + 1] ?? 0, tile.rgba[o + 2] ?? 0];
}

/** Tests inject decoded tiles. Runtime uses `ensureWxLevelTiles`. */
export function setWxLevelTiles(next: Array<WxLevelTile | null> | null): void {
  tiles = next
    ? [
        next[0] ?? null,
        next[1] ?? null,
        next[2] ?? null,
        next[3] ?? null,
        next[4] ?? null,
        next[5] ?? null,
      ]
    : [null, null, null, null, null, null];
  settled = next !== null;
  tilesGen += 1;
}

export interface EnsureWxLevelTilesOpts {
  fetchImpl?: typeof fetch;
  urls?: readonly string[];
}

export function ensureWxLevelTiles(opts: EnsureWxLevelTilesOpts = {}): Promise<void> | undefined {
  if (settled) {
    return undefined;
  }
  if (inFlight) {
    return inFlight;
  }
  const fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const urls = opts.urls ?? WX_LEVEL_TILE_URLS;
  inFlight = (async () => {
    const next: Array<WxLevelTile | null> = [null, null, null, null, null, null];
    await Promise.all(
      urls.map(async (url, i) => {
        try {
          const res = await fetchImpl(url);
          if (!res.ok) {
            return;
          }
          const png = new Uint8Array(await res.arrayBuffer());
          if (!isPng(png)) {
            return;
          }
          const decoded = await decodePngToRgba(png);
          next[i] = {
            width: decoded.width,
            height: decoded.height,
            rgba: decoded.rgba,
          };
        } catch {
          return;
        }
      }),
    );
    if (next.some((tile) => tile !== null)) {
      tiles = next;
      settled = true;
      tilesGen += 1;
    }
  })().finally(() => {
    inFlight = undefined;
  });
  return inFlight;
}
