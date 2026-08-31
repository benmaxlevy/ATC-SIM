import { DEFAULT_WX_VIP_BREAKS_DBZ, type VipBin } from "./types";

/**
 * Map reflectivity (dBZ) onto VIP 0 | 1–6 using data-provided lower edges.
 * `breaks[0]` is VIP 1, `breaks[5]` is VIP 6. Values below the first break
 * (including clear-air) are 0. Extra breaks beyond six are ignored.
 */
export function binVip(dbz: number, breaks: readonly number[] = DEFAULT_WX_VIP_BREAKS_DBZ): VipBin {
  if (!Number.isFinite(dbz)) {
    return 0;
  }
  let level = 0;
  const n = Math.min(6, breaks.length);
  for (let i = 0; i < n; i++) {
    const edge = breaks[i];
    if (edge !== undefined && dbz >= edge) {
      level = i + 1;
    }
  }
  return level as VipBin;
}
