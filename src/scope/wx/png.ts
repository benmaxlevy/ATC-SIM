const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ (bytes[i] ?? 0)) & 255]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < data.length; i++) {
    a = (a + (data[i] ?? 0)) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function writeU32(out: Uint8Array, offset: number, value: number): void {
  out[offset] = (value >>> 24) & 255;
  out[offset + 1] = (value >>> 16) & 255;
  out[offset + 2] = (value >>> 8) & 255;
  out[offset + 3] = value & 255;
}

function zlibStore(raw: Uint8Array): Uint8Array {
  const blocks: number[] = [0x78, 0x01];
  let offset = 0;
  while (offset < raw.length || raw.length === 0) {
    const n = Math.min(65535, raw.length - offset);
    const final = offset + n >= raw.length ? 1 : 0;
    blocks.push(final);
    blocks.push(n & 255, (n >> 8) & 255);
    const nlen = ~n;
    blocks.push(nlen & 255, (nlen >> 8) & 255);
    for (let i = 0; i < n; i++) {
      blocks.push(raw[offset + i] ?? 0);
    }
    offset += n;
    if (raw.length === 0) {
      break;
    }
  }
  const sum = adler32(raw);
  blocks.push((sum >>> 24) & 255, (sum >>> 16) & 255, (sum >>> 8) & 255, sum & 255);
  return new Uint8Array(blocks);
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeU32(out, 0, data.length);
  out[4] = type.charCodeAt(0);
  out[5] = type.charCodeAt(1);
  out[6] = type.charCodeAt(2);
  out[7] = type.charCodeAt(3);
  out.set(data, 8);
  const crcBytes = out.subarray(4, 8 + data.length);
  writeU32(out, 8 + data.length, crc32(crcBytes));
  return out;
}

/** Fixture helper: 8-bit RGBA PNG, filter 0, stored deflate. Not used for IEM. */
export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }
  const ihdr = new Uint8Array(13);
  writeU32(ihdr, 0, width);
  writeU32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const parts = [
    PNG_SIG,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibStore(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  return concat(parts);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function concat(chunks: Uint8Array[]): Uint8Array {
  let n = 0;
  for (const c of chunks) {
    n += c.length;
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

/** Unwrap zlib + stored deflate from `encodeRgbaPng`. No stream. */
function inflateZlibStored(data: Uint8Array): Uint8Array | null {
  if (data.length < 8 || data[0] !== 0x78) {
    return null;
  }
  let i = 2;
  const out: number[] = [];
  for (;;) {
    if (i + 5 > data.length) {
      return null;
    }
    const header = data[i] ?? 0;
    const final = (header & 1) === 1;
    const type = (header >> 1) & 3;
    if (type !== 0) {
      return null;
    }
    i += 1;
    const n = (data[i] ?? 0) | ((data[i + 1] ?? 0) << 8);
    const nlen = (data[i + 2] ?? 0) | ((data[i + 3] ?? 0) << 8);
    if ((n ^ 0xffff) !== nlen) {
      return null;
    }
    i += 4;
    if (i + n + 4 > data.length) {
      return null;
    }
    for (let k = 0; k < n; k++) {
      out.push(data[i + k] ?? 0);
    }
    i += n;
    if (final) {
      break;
    }
  }
  return new Uint8Array(out);
}

type ZlibBuiltin = { inflateSync(data: Uint8Array): Uint8Array };

function nodeZlibInflate(data: Uint8Array): Uint8Array | null {
  const getBuiltin = (
    globalThis as { process?: { getBuiltinModule?: (name: string) => ZlibBuiltin } }
  ).process?.getBuiltinModule;
  if (!getBuiltin) {
    return null;
  }
  try {
    return (getBuiltin("node:zlib") ?? getBuiltin("zlib")).inflateSync(data);
  } catch {
    return null;
  }
}

async function inflateViaDecompressionStream(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream("deflate");
  const response = new Response(new Response(data as BodyInit).body!.pipeThrough(stream));
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function inflateZlib(data: Uint8Array): Promise<Uint8Array> {
  const stored = inflateZlibStored(data);
  if (stored) {
    return stored;
  }
  const fromNode = nodeZlibInflate(data);
  if (fromNode) {
    return fromNode;
  }
  if (typeof DecompressionStream === "function") {
    return inflateViaDecompressionStream(data);
  }
  throw new Error("deflate unavailable");
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) {
    return a;
  }
  if (pb <= pc) {
    return b;
  }
  return c;
}

function unfilter(raw: Uint8Array, width: number, height: number, bpp: number): Uint8Array {
  const stride = width * bpp;
  const out = new Uint8Array(stride * height);
  let src = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[src++] ?? 0;
    const dst = y * stride;
    const prev = y === 0 ? null : (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const sample = raw[src++] ?? 0;
      const left = x >= bpp ? (out[dst + x - bpp] ?? 0) : 0;
      const up = prev === null ? 0 : (out[prev + x] ?? 0);
      const upLeft = prev === null || x < bpp ? 0 : (out[prev + x - bpp] ?? 0);
      let recon = sample;
      switch (filter) {
        case 1:
          recon = (sample + left) & 255;
          break;
        case 2:
          recon = (sample + up) & 255;
          break;
        case 3:
          recon = (sample + ((left + up) >> 1)) & 255;
          break;
        case 4:
          recon = (sample + paeth(left, up, upLeft)) & 255;
          break;
        default:
          recon = sample;
      }
      out[dst + x] = recon;
    }
  }
  return out;
}

function expandToRgba(
  samples: Uint8Array,
  width: number,
  height: number,
  colorType: number,
  palette: Uint8Array | null,
  trns: Uint8Array | null,
): Uint8Array {
  const rgba = new Uint8Array(width * height * 4);
  let s = 0;
  let d = 0;
  for (let i = 0; i < width * height; i++) {
    if (colorType === 6) {
      rgba[d] = samples[s] ?? 0;
      rgba[d + 1] = samples[s + 1] ?? 0;
      rgba[d + 2] = samples[s + 2] ?? 0;
      rgba[d + 3] = samples[s + 3] ?? 0;
      s += 4;
    } else if (colorType === 2) {
      const r = samples[s] ?? 0;
      const g = samples[s + 1] ?? 0;
      const b = samples[s + 2] ?? 0;
      rgba[d] = r;
      rgba[d + 1] = g;
      rgba[d + 2] = b;
      rgba[d + 3] = 255;
      if (trns && trns.length >= 6) {
        const tr = (trns[1] ?? 0) | ((trns[0] ?? 0) << 8);
        const tg = (trns[3] ?? 0) | ((trns[2] ?? 0) << 8);
        const tb = (trns[5] ?? 0) | ((trns[4] ?? 0) << 8);
        if (r === tr && g === tg && b === tb) {
          rgba[d + 3] = 0;
        }
      }
      s += 3;
    } else if (colorType === 3) {
      const idx = samples[s++] ?? 0;
      const p = idx * 3;
      rgba[d] = palette?.[p] ?? 0;
      rgba[d + 1] = palette?.[p + 1] ?? 0;
      rgba[d + 2] = palette?.[p + 2] ?? 0;
      rgba[d + 3] = trns?.[idx] ?? 255;
    } else if (colorType === 0) {
      const v = samples[s++] ?? 0;
      rgba[d] = v;
      rgba[d + 1] = v;
      rgba[d + 2] = v;
      rgba[d + 3] = 255;
    } else if (colorType === 4) {
      const v = samples[s++] ?? 0;
      rgba[d] = v;
      rgba[d + 1] = v;
      rgba[d + 2] = v;
      rgba[d + 3] = samples[s++] ?? 0;
    } else {
      throw new Error("unsupported PNG color type");
    }
    d += 4;
  }
  return rgba;
}

export function isPng(bytes: Uint8Array): boolean {
  if (bytes.length < PNG_SIG.length) {
    return false;
  }
  for (let i = 0; i < PNG_SIG.length; i++) {
    if (bytes[i] !== PNG_SIG[i]) {
      return false;
    }
  }
  return true;
}

export interface DecodedPng {
  width: number;
  height: number;
  rgba: Uint8Array;
}

async function decodePngViaBitmap(bytes: Uint8Array): Promise<DecodedPng> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("createImageBitmap unavailable");
  }
  const blob = new Blob([bytes.slice()], { type: "image/png" });
  const bmp = await createImageBitmap(blob);
  try {
    if (typeof OffscreenCanvas !== "function") {
      throw new Error("OffscreenCanvas unavailable");
    }
    const canvas = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("bitmap canvas unavailable");
    }
    ctx.drawImage(bmp, 0, 0);
    const image = ctx.getImageData(0, 0, bmp.width, bmp.height);
    return { width: bmp.width, height: bmp.height, rgba: new Uint8Array(image.data) };
  } finally {
    bmp.close();
  }
}

async function decodePngToRgbaManual(bytes: Uint8Array): Promise<DecodedPng> {
  for (let i = 0; i < PNG_SIG.length; i++) {
    if (bytes[i] !== PNG_SIG[i]) {
      throw new Error("not a PNG");
    }
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Uint8Array[] = [];
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  while (offset + 12 <= bytes.length) {
    const len = readU32(bytes, offset);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    const dataStart = offset + 8;
    const data = bytes.subarray(dataStart, dataStart + len);
    if (type === "IHDR") {
      width = readU32(data, 0);
      height = readU32(data, 4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      interlace = data[12] ?? 0;
    } else if (type === "PLTE") {
      palette = data.slice();
    } else if (type === "tRNS") {
      trns = data.slice();
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset = dataStart + len + 4;
  }
  if (bitDepth !== 8 || interlace !== 0 || width <= 0 || height <= 0) {
    throw new Error("unsupported PNG");
  }
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const inflated = await inflateZlib(concat(idat));
  const samples = unfilter(inflated, width, height, bpp);
  const rgba = expandToRgba(samples, width, height, colorType, palette, trns);
  return { width, height, rgba };
}

/**
 * Decode an 8-bit non-interlaced PNG to RGBA. Used at fetch time, not in the
 * animation loop. IEM tiles are PNG; PPI paint is T02-69. Manual inflate
 * first — createImageBitmap can hang in Node on large store-compressed tiles.
 */
export async function decodePngToRgba(bytes: Uint8Array): Promise<DecodedPng> {
  try {
    return await decodePngToRgbaManual(bytes);
  } catch (err) {
    if (typeof document === "undefined") {
      throw err;
    }
    return decodePngViaBitmap(bytes);
  }
}
