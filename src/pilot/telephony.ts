import { speakDigitString } from "./digits";

/**
 * Minimum ICAO → telephony map for v1 readbacks.
 * Unknown 3-letter prefixes use the FAA/ICAO phonetic alphabet, not English
 * letter names (`XYZ99` → `x-ray yankee zulu niner niner`).
 */
export const AIRLINE_TELEPHONY: Readonly<Record<string, string>> = {
  DAL: "delta",
  AAL: "american",
  UAL: "united",
  SWA: "southwest",
  JBU: "jetblue",
  NKS: "spirit",
  FFT: "frontier",
  ASA: "alaska",
  FDX: "fedex",
  UPS: "u p s",
};

/** NATO/FAA phonetic (JO 7110.65). `x-ray` keeps the ticket hyphen. */
export const FAA_PHONETIC: Readonly<Record<string, string>> = {
  A: "alfa",
  B: "bravo",
  C: "charlie",
  D: "delta",
  E: "echo",
  F: "foxtrot",
  G: "golf",
  H: "hotel",
  I: "india",
  J: "juliett",
  K: "kilo",
  L: "lima",
  M: "mike",
  N: "november",
  O: "oscar",
  P: "papa",
  Q: "quebec",
  R: "romeo",
  S: "sierra",
  T: "tango",
  U: "uniform",
  V: "victor",
  W: "whiskey",
  X: "x-ray",
  Y: "yankee",
  Z: "zulu",
};

function speakPhoneticLetter(letter: string): string {
  return FAA_PHONETIC[letter] ?? letter.toLowerCase();
}

/** Letters as FAA phonetic, digits as FAA digit words. */
export function speakAlphanumeric(text: string): string {
  return [...text.toUpperCase()]
    .filter((ch) => /[A-Z0-9]/.test(ch))
    .map((ch) => (ch >= "0" && ch <= "9" ? speakDigitString(ch) : speakPhoneticLetter(ch)))
    .join(" ");
}

/**
 * `DAL123` → `delta one two three`. Unknown `XYZ99` → `x-ray yankee zulu niner niner`.
 */
export function formatCallsignSpeech(callsign: string): string {
  const cs = callsign.trim().toUpperCase();
  if (!cs) {
    return "";
  }
  if (/^[A-Z]{3}/.test(cs)) {
    const prefix = cs.slice(0, 3);
    const rest = cs.slice(3);
    const head = AIRLINE_TELEPHONY[prefix] ?? speakAlphanumeric(prefix);
    const tail = speakAlphanumeric(rest);
    return [head, tail].filter((part) => part.length > 0).join(" ");
  }
  return speakAlphanumeric(cs);
}
