import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { createScopeView } from "../../scopeView";
import { WX_REFRESH_MS, emptyWxMosaic } from "../index";
import { anyWxLevelOn, ensureWxMosaic } from "../ensure";

const FIXTURE_PNG = new URL("../../../../testdata/wx/n0q-vip-edges.png", import.meta.url);

function mockFetch(calls: string[]): typeof fetch {
  const png = new Uint8Array(readFileSync(FIXTURE_PNG));
  return async (input) => {
    calls.push(String(input));
    return new Response(png, { status: 200 });
  };
}

test("anyWxLevelOn is false until one latch is true", () => {
  expect(anyWxLevelOn([false, false, false, false, false, false])).toBe(false);
  expect(anyWxLevelOn([false, false, true, false, false, false])).toBe(true);
});

test("ensureWxMosaic fixtureUrl fetches the sample PNG once, not IEM tiles", async () => {
  const view = createScopeView(0, 0, { arp: { latDeg: 33.6, lonDeg: -84.4 } });
  view.wxLevels = [true, false, false, false, false, false];
  const calls: string[] = [];
  await ensureWxMosaic(view, {
    nowMs: 3_000,
    fixtureUrl: "/testdata/wx/n0q-vip-edges.png",
    fetchImpl: mockFetch(calls),
  });
  expect(calls).toEqual(["/testdata/wx/n0q-vip-edges.png"]);
  expect(view.wxMosaic.widthPx).toBe(8);
  expect(view.wxMosaic.heightPx).toBe(2);
  expect(view.wxMosaic.source).toBe("fixture");
  const second = ensureWxMosaic(view, {
    nowMs: 4_000,
    fixtureUrl: "/testdata/wx/n0q-vip-edges.png",
    fetchImpl: mockFetch(calls),
  });
  expect(second).toBeUndefined();
  expect(calls).toEqual(["/testdata/wx/n0q-vip-edges.png"]);
});

test("ensureWxMosaic fixtureUrl replaces a stale empty IEM mosaic", async () => {
  const arp = { latDeg: 33.6, lonDeg: -84.4 };
  const view = createScopeView(0, 0, { arp });
  view.wxLevels = [true, true, true, true, true, true];
  view.wxMosaic = emptyWxMosaic({
    ...{
      westLon: arp.lonDeg - 1,
      eastLon: arp.lonDeg + 1,
      southLat: arp.latDeg - 1,
      northLat: arp.latDeg + 1,
    },
    fetchedAtMs: 10_000,
    source: "iem",
  });
  const calls: string[] = [];
  await ensureWxMosaic(view, {
    nowMs: 11_000,
    fixtureUrl: "/testdata/wx/n0q-vip-edges.png",
    fetchImpl: mockFetch(calls),
  });
  expect(calls).toEqual(["/testdata/wx/n0q-vip-edges.png"]);
  expect(view.wxMosaic.source).toBe("fixture");
  expect(view.wxMosaic.widthPx).toBe(8);
});

test("ensureWxMosaic fetches at boot when all levels are off", async () => {
  const view = createScopeView(0, 0, { arp: { latDeg: 33.6, lonDeg: -84.4 } });
  const calls: string[] = [];
  await ensureWxMosaic(view, { nowMs: 1_000, fetchImpl: mockFetch(calls) });
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(view.wxMosaic.widthPx).toBeGreaterThan(0);
});

test("ensureWxMosaic fetches once when a level is on and mosaic is empty", async () => {
  const view = createScopeView(0, 0, { arp: { latDeg: 33.6, lonDeg: -84.4 } });
  view.wxLevels = [true, false, false, false, false, false];
  const calls: string[] = [];
  const fetchImpl = mockFetch(calls);
  await ensureWxMosaic(view, { nowMs: 5_000, fetchImpl });
  expect(calls.length).toBeGreaterThanOrEqual(1);
  expect(calls.length).toBeLessThanOrEqual(4);
  expect(calls[0]).toMatch(/^\/wx-iem\//);
  expect(view.wxMosaic.widthPx).toBeGreaterThan(0);
  expect(view.wxMosaic.fetchedAtMs).toBe(5_000);
  const firstBatch = calls.length;

  view.wxLevels = [true, true, false, false, false, false];
  const second = ensureWxMosaic(view, { nowMs: 6_000, fetchImpl });
  expect(second).toBeUndefined();
  expect(calls).toHaveLength(firstBatch);
});

test("ensureWxMosaic shares one in-flight tile fetch and refetches after 5 min", async () => {
  const view = createScopeView(0, 0, { arp: { latDeg: 33.6, lonDeg: -84.4 } });
  view.wxLevels = [false, false, false, false, false, true];
  const calls: string[] = [];
  const fetchImpl = mockFetch(calls);
  const first = ensureWxMosaic(view, { nowMs: 0, fetchImpl });
  const overlap = ensureWxMosaic(view, { nowMs: 10, fetchImpl });
  expect(overlap).toBe(first);
  await first;
  const batch = calls.length;
  expect(batch).toBeGreaterThanOrEqual(1);
  expect(batch).toBeLessThanOrEqual(4);

  await ensureWxMosaic(view, { nowMs: WX_REFRESH_MS, fetchImpl });
  expect(calls).toHaveLength(batch * 2);
  expect(view.wxMosaic.fetchedAtMs).toBe(WX_REFRESH_MS);
});

test("ensureWxMosaic refreshes after five minutes while all levels are off", async () => {
  const view = createScopeView(0, 0, { arp: { latDeg: 33.6, lonDeg: -84.4 } });
  const calls: string[] = [];
  const fetchImpl = mockFetch(calls);
  await ensureWxMosaic(view, { nowMs: 1, fetchImpl });
  const kept = view.wxMosaic;
  expect(ensureWxMosaic(view, { nowMs: 2, fetchImpl })).toBeUndefined();
  expect(view.wxMosaic).toBe(kept);
  const firstBatch = calls.length;
  await ensureWxMosaic(view, { nowMs: WX_REFRESH_MS + 1, fetchImpl });
  expect(calls).toHaveLength(firstBatch * 2);
  expect(view.wxMosaic.fetchedAtMs).toBe(WX_REFRESH_MS + 1);
  expect(emptyWxMosaic().widthPx).toBe(0);
});
