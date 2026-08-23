/**
 * Minimum ICAO → telephony map for v1 readbacks.
 * Unknown 3-letter prefixes use the FAA/ICAO phonetic alphabet, not English
 * letter names (`XYZ99` → `X-ray Yankee Zulu 99`).
 */
export const AIRLINE_TELEPHONY: Readonly<Record<string, string>> = {
  DAL: "Delta",
  AAL: "American",
  UAL: "United",
  SWA: "Southwest",
  JBU: "JetBlue",
  NKS: "Spirit",
  FFT: "Frontier",
  ASA: "Alaska",
  FDX: "FedEx",
  UPS: "UPS",
};

/** NATO/FAA phonetic (JO 7110.65). `X-ray` keeps the ticket hyphen. */
export const FAA_PHONETIC: Readonly<Record<string, string>> = {
  A: "Alfa",
  B: "Bravo",
  C: "Charlie",
  D: "Delta",
  E: "Echo",
  F: "Foxtrot",
  G: "Golf",
  H: "Hotel",
  I: "India",
  J: "Juliett",
  K: "Kilo",
  L: "Lima",
  M: "Mike",
  N: "November",
  O: "Oscar",
  P: "Papa",
  Q: "Quebec",
  R: "Romeo",
  S: "Sierra",
  T: "Tango",
  U: "Uniform",
  V: "Victor",
  W: "Whiskey",
  X: "X-ray",
  Y: "Yankee",
  Z: "Zulu",
};

function speakPhoneticLetter(letter: string): string {
  return FAA_PHONETIC[letter] ?? letter.toUpperCase();
}

/** Letters as FAA phonetic (title case); consecutive digits stay grouped numerals. */
export function speakAlphanumeric(text: string): string {
  const chars = [...text.toUpperCase()].filter((ch) => /[A-Z0-9]/.test(ch));
  const parts: string[] = [];
  let digits = "";
  for (const ch of chars) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      continue;
    }
    if (digits) {
      parts.push(digits);
      digits = "";
    }
    parts.push(speakPhoneticLetter(ch));
  }
  if (digits) {
    parts.push(digits);
  }
  return parts.join(" ");
}

/**
 * `DAL123` → `Delta 123`. Unknown `XYZ99` → `X-ray Yankee Zulu 99`.
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
