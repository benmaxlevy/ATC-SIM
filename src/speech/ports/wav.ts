import type { AudioClip } from "../types";

const WAV_HEADER_BYTES = 44;
const PCM_FORMAT = 1;
const BITS_PER_SAMPLE = 16;
const HEADER_FMT_SIZE = 16;

function writeFourCC(view: DataView, offset: number, tag: string): void {
  view.setUint8(offset, tag.charCodeAt(0));
  view.setUint8(offset + 1, tag.charCodeAt(1));
  view.setUint8(offset + 2, tag.charCodeAt(2));
  view.setUint8(offset + 3, tag.charCodeAt(3));
}

function readFourCC(view: DataView, offset: number): string {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function pcm16ToLeBytes(pcm16: Int16Array): Uint8Array {
  const bytes = new Uint8Array(pcm16.length * 2);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < pcm16.length; i += 1) {
    view.setInt16(i * 2, pcm16[i]!, true);
  }
  return bytes;
}

export function leBytesToPcm16(bytes: Uint8Array): Int16Array {
  const even = bytes.byteLength - (bytes.byteLength % 2);
  const pcm16 = new Int16Array(even / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, even);
  for (let i = 0; i < pcm16.length; i += 1) {
    pcm16[i] = view.getInt16(i * 2, true);
  }
  return pcm16;
}

/** Copy into a standalone ArrayBuffer so fetch BodyInit accepts the bytes. */
export function uint8ToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

/** True when `bytes` looks like a RIFF/WAVE container. */
export function isWav(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) {
    return false;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return readFourCC(view, 0) === "RIFF" && readFourCC(view, 8) === "WAVE";
}

/**
 * Encode mono PCM16 as a 44-byte-header WAV (RIFF, 16-bit, little-endian).
 * Default STT body for our speech-api (`POST /stt`, Content-Type: audio/wav).
 */
export function pcm16ToWav(clip: AudioClip): Uint8Array {
  const channels = 1;
  const dataBytes = pcm16ToLeBytes(clip.pcm16);
  const wav = new Uint8Array(WAV_HEADER_BYTES + dataBytes.byteLength);
  const view = new DataView(wav.buffer);
  const byteRate = clip.sampleRate * channels * (BITS_PER_SAMPLE / 8);
  const blockAlign = channels * (BITS_PER_SAMPLE / 8);

  writeFourCC(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes.byteLength, true);
  writeFourCC(view, 8, "WAVE");
  writeFourCC(view, 12, "fmt ");
  view.setUint32(16, HEADER_FMT_SIZE, true);
  view.setUint16(20, PCM_FORMAT, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, clip.sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, BITS_PER_SAMPLE, true);
  writeFourCC(view, 36, "data");
  view.setUint32(40, dataBytes.byteLength, true);
  wav.set(dataBytes, WAV_HEADER_BYTES);
  return wav;
}

/**
 * Decode a PCM WAV into an AudioClip. Keeps the file's sampleRate (do not resample here).
 * 16-bit PCM only; extra RIFF chunks are skipped.
 */
export function wavToAudioClip(bytes: Uint8Array): AudioClip {
  if (!isWav(bytes)) {
    throw new Error("not a RIFF/WAVE body");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let audioFormat = 0;
  let pcm: Int16Array | undefined;

  while (offset + 8 <= bytes.byteLength) {
    const chunkId = readFourCC(view, offset);
    const chunkSize = view.getUint32(offset + 4, true);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > bytes.byteLength) {
      throw new Error("WAV chunk overruns buffer");
    }
    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        throw new Error("WAV fmt chunk too small");
      }
      audioFormat = view.getUint16(dataOffset, true);
      channels = view.getUint16(dataOffset + 2, true);
      sampleRate = view.getUint32(dataOffset + 4, true);
      bitsPerSample = view.getUint16(dataOffset + 14, true);
    } else if (chunkId === "data") {
      const slice = bytes.subarray(dataOffset, dataOffset + chunkSize);
      if (channels > 1) {
        pcm = extractFirstChannel(slice, channels, bitsPerSample);
      } else {
        pcm = leBytesToPcm16(slice);
      }
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }

  if (audioFormat !== PCM_FORMAT) {
    throw new Error("WAV is not 16-bit PCM");
  }
  if (bitsPerSample !== BITS_PER_SAMPLE) {
    throw new Error("WAV is not 16-bit PCM");
  }
  if (sampleRate <= 0 || channels < 1) {
    throw new Error("WAV fmt chunk missing");
  }
  if (!pcm || pcm.length === 0) {
    throw new Error("WAV data chunk empty");
  }
  return { sampleRate, channels: 1, pcm16: pcm };
}

function extractFirstChannel(
  data: Uint8Array,
  channels: number,
  bitsPerSample: number,
): Int16Array {
  if (bitsPerSample !== BITS_PER_SAMPLE) {
    throw new Error("WAV is not 16-bit PCM");
  }
  const frameBytes = channels * 2;
  const frames = Math.floor(data.byteLength / frameBytes);
  const pcm = new Int16Array(frames);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < frames; i += 1) {
    pcm[i] = view.getInt16(i * frameBytes, true);
  }
  return pcm;
}
