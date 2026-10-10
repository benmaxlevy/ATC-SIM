import type { WxMosaic } from "../wx/types";

export interface WeatherCompositeInput {
  width: number;
  height: number;
  masks: WxMosaic["vipMasks"];
  colors: readonly (readonly [number, number, number])[];
}

export interface WeatherCompositePixels {
  width: number;
  height: number;
  layers: Array<Uint8ClampedArray | null>;
}

/** Build only available intensity planes, once per mosaic rather than per toggle. */
function* compositeRows(input: WeatherCompositeInput): Generator<void, WeatherCompositePixels> {
  const { width, height, masks, colors } = input;
  const count = width * height;
  const layers: Array<Uint8ClampedArray | null> = [];
  for (let level = 0; level < 6; level++) {
    const mask = masks[level]!;
    const fullBytes = Math.floor(count / 8);
    const available =
      mask.subarray(0, fullBytes).some((value) => value !== 0) ||
      (count % 8 > 0 && ((mask[fullBytes] ?? 0) & ((1 << (count % 8)) - 1)) !== 0);
    if (!available) {
      layers.push(null);
      continue;
    }
    const pixels = new Uint8ClampedArray(count * 4);
    const color = colors[level]!;
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const index = row * width + col;
        if (((mask[index >> 3] ?? 0) & (1 << (index & 7))) === 0) continue;
        const offset = index * 4;
        pixels[offset] = color[0];
        pixels[offset + 1] = color[1];
        pixels[offset + 2] = color[2];
        pixels[offset + 3] = 255;
      }
      if ((row + 1) % 16 === 0) yield;
    }
    layers.push(pixels);
  }
  return { width, height, layers };
}

export function buildWeatherComposite(input: WeatherCompositeInput): WeatherCompositePixels {
  const rows = compositeRows(input);
  let result = rows.next();
  while (!result.done) result = rows.next();
  return result.value;
}

/** Yield between bounded row batches when workers are unavailable. */
export async function buildWeatherCompositeAsync(
  input: WeatherCompositeInput,
  isCurrent: () => boolean,
): Promise<WeatherCompositePixels | undefined> {
  const rows = compositeRows(input);
  while (isCurrent()) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (!isCurrent()) return undefined;
    const result = rows.next();
    if (result.done) return result.value;
  }
  return undefined;
}
