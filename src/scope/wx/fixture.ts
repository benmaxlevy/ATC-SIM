/** Local VIP-edge PNG. Used when `?wx=fixture` so the PPI can paint without IEM. */
export const WX_N0Q_VIP_EDGES_PNG_URL = new URL(
  "../../../testdata/wx/n0q-vip-edges.png",
  import.meta.url,
).href;

export function isWxFixtureEnabled(search: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("wx") === "fixture";
}
