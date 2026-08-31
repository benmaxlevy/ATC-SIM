/**
 * Session-loop hook: fetch IEM N0Q when any VIP latch is on and the mosaic
 * is missing or older than WX_REFRESH_MS (5 min). Extra WX clicks do not
 * refetch. All-off skips the network and keeps the last mosaic.
 */

import type { LatLon } from "@core";
import { fetchWxMosaic, shouldRefetch } from "./mosaic";
import type { WxLevels, WxMosaic } from "./types";

/** Duck type so `wx/` does not import `scopeView` (cycle). */
export interface WxEnsureTarget {
  arp: LatLon;
  wxLevels: WxLevels;
  wxMosaic: WxMosaic;
}

const inFlight = new WeakMap<WxEnsureTarget, Promise<void>>();

export function anyWxLevelOn(levels: WxLevels): boolean {
  return levels[0] || levels[1] || levels[2] || levels[3] || levels[4] || levels[5];
}

export interface EnsureWxMosaicOpts {
  nowMs: number;
  fetchImpl?: typeof fetch;
  fixtureUrl?: string;
}

/**
 * Start at most one IEM cover fetch per view. Assigns `view.wxMosaic` when done.
 * Tests inject `fetchImpl`. Runtime uses `globalThis.fetch` via `/wx-iem`.
 */
export function ensureWxMosaic(
  view: WxEnsureTarget,
  opts: EnsureWxMosaicOpts,
): Promise<void> | undefined {
  if (!anyWxLevelOn(view.wxLevels)) {
    return undefined;
  }
  const pending = inFlight.get(view);
  if (pending) {
    return pending;
  }
  if (!shouldRefetch(view.wxMosaic, opts.nowMs, view.arp)) {
    return undefined;
  }
  const started = fetchWxMosaic({
    arp: view.arp,
    nowMs: opts.nowMs,
    fetchImpl: opts.fetchImpl,
    fixtureUrl: opts.fixtureUrl,
  })
    .then((mosaic) => {
      view.wxMosaic = mosaic;
    })
    .finally(() => {
      if (inFlight.get(view) === started) {
        inFlight.delete(view);
      }
    });
  inFlight.set(view, started);
  return started;
}
