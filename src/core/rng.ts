/**
 * Seeded uint32 PRNG in `[0, 1)`. Trainer traffic mix (T04-14), not 7110.65
 * random vectors. Phase 5 replay may reuse this — do not implement replay here.
 * No unseeded PRNG and no wall-clock seed.
 */

/**
 * Mulberry32: one uint32 state, returns `[0, 1)`. Same seed → same stream.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
