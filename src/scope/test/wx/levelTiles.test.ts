import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { decodePngToRgba } from "../../wx/png";
import {
  WX_LEVEL_TILE_URLS,
  ensureWxLevelTiles,
  sampleWxLevelTile,
  setWxLevelTiles,
} from "../../wx/levelTiles";

test("sampleWxLevelTile wraps on a shared origin", () => {
  const rgba = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 1, 2, 3, 255]);
  setWxLevelTiles([{ width: 2, height: 2, rgba }, null, null, null, null, null]);
  expect(sampleWxLevelTile(1, 0, 0)).toEqual([10, 20, 30]);
  expect(sampleWxLevelTile(1, 2, 0)).toEqual([10, 20, 30]);
  expect(sampleWxLevelTile(1, 1, 0)).toEqual([40, 50, 60]);
  expect(sampleWxLevelTile(2, 0, 0)).toBeNull();
  setWxLevelTiles(null);
});

test("committed wx1-6 tiles decode", async () => {
  expect(WX_LEVEL_TILE_URLS).toHaveLength(6);
  const png = new Uint8Array(
    readFileSync(new URL("../../../../testdata/wx/levels/wx1.png", import.meta.url)),
  );
  const decoded = await decodePngToRgba(png);
  expect(decoded.width).toBeGreaterThan(0);
  expect(decoded.height).toBeGreaterThan(0);
  expect(decoded.rgba[0]).toBe(0x0d);
  expect(decoded.rgba[1]).toBe(0x1b);
  expect(decoded.rgba[2]).toBe(0x0e);
});

test("ensureWxLevelTiles fetches each level PNG once", async () => {
  setWxLevelTiles(null);
  const calls: string[] = [];
  const png = new Uint8Array(
    readFileSync(new URL("../../../../testdata/wx/levels/wx2.png", import.meta.url)),
  );
  await ensureWxLevelTiles({
    urls: ["/wx-levels/wx1.png", "/wx-levels/wx2.png"],
    fetchImpl: async (input) => {
      calls.push(String(input));
      return new Response(png, { status: 200 });
    },
  });
  expect(calls).toEqual(["/wx-levels/wx1.png", "/wx-levels/wx2.png"]);
  expect(sampleWxLevelTile(2, 0, 0)).not.toBeNull();
  expect(ensureWxLevelTiles()).toBeUndefined();
  setWxLevelTiles(null);
});
