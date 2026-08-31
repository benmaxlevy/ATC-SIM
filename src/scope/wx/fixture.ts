/** Local 8×2 VIP-edge sample. Tests inject it via `fixtureUrl`; boot never reads a query. */

export const N0Q_VIP_EDGES_WIDTH = 8;
export const N0Q_VIP_EDGES_HEIGHT = 2;

/** 8×2 RGBA: transparent / black / unknown / VIP edges / JO 30-40-50 neighbors. */
export const N0Q_VIP_EDGES_PIXELS: readonly {
  r: number;
  g: number;
  b: number;
  a: number;
  vip: number;
}[] = [
  { r: 0, g: 0, b: 0, a: 0, vip: 0 },
  { r: 0, g: 0, b: 0, a: 255, vip: 0 },
  { r: 128, g: 128, b: 128, a: 255, vip: 0 },
  { r: 0, g: 0, b: 246, a: 255, vip: 0 },
  { r: 0, g: 153, b: 98, a: 255, vip: 1 },
  { r: 0, g: 144, b: 0, a: 255, vip: 2 },
  { r: 250, g: 242, b: 0, a: 255, vip: 3 },
  { r: 236, g: 182, b: 0, a: 255, vip: 4 },
  { r: 255, g: 115, b: 0, a: 255, vip: 5 },
  { r: 247, g: 0, b: 0, a: 255, vip: 6 },
  { r: 0, g: 200, b: 0, a: 255, vip: 1 },
  { r: 255, g: 255, b: 0, a: 255, vip: 2 },
  { r: 231, g: 192, b: 0, a: 255, vip: 3 },
  { r: 255, g: 0, b: 0, a: 255, vip: 5 },
  { r: 0, g: 255, b: 0, a: 255, vip: 1 },
  { r: 214, g: 0, b: 0, a: 255, vip: 6 },
];

export function n0qVipEdgesRgba(): Uint8Array {
  const rgba = new Uint8Array(N0Q_VIP_EDGES_PIXELS.length * 4);
  N0Q_VIP_EDGES_PIXELS.forEach((p, i) => {
    rgba[i * 4] = p.r;
    rgba[i * 4 + 1] = p.g;
    rgba[i * 4 + 2] = p.b;
    rgba[i * 4 + 3] = p.a;
  });
  return rgba;
}
