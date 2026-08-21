/**
 * Spoken number slots for Path A (JO 7110.65 / AIM digit grouping — R03).
 * Headings are three spoken digits; 360 normalizes to 0. Altitude is feet, not FL.
 */

export const ONES: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

export const TEENS: Readonly<Record<string, number>> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

export const TENS: Readonly<Record<string, number>> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

export function isNumberish(tok: string | undefined): boolean {
  if (tok === undefined) {
    return false;
  }
  return tok in ONES || tok in TEENS || tok in TENS || /^\d+$/.test(tok);
}

export function singleDigit(tok: string | undefined): number | null {
  if (tok === undefined) {
    return null;
  }
  if (tok in ONES) {
    return ONES[tok]!;
  }
  if (/^\d$/.test(tok)) {
    return Number(tok);
  }
  return null;
}

function groupedNumberToken(tok: string | undefined): number | null {
  if (tok === undefined) {
    return null;
  }
  const digit = singleDigit(tok);
  if (digit !== null) {
    return digit;
  }
  if (tok in TEENS) {
    return TEENS[tok]!;
  }
  if (tok in TENS) {
    return TENS[tok]!;
  }
  if (/^\d+$/.test(tok)) {
    return Number(tok);
  }
  return null;
}

/** Exactly three spoken digits. `three six zero` → 0. Values above 360 are not headings. */
export function parseHeadingDeg(
  tokens: readonly string[],
  i: number,
): { value: number; next: number } | null {
  const a = singleDigit(tokens[i]);
  const b = singleDigit(tokens[i + 1]);
  const c = singleDigit(tokens[i + 2]);
  if (a === null || b === null || c === null) {
    return null;
  }
  const n = a * 100 + b * 10 + c;
  if (n > 360) {
    return null;
  }
  return { value: n === 360 ? 0 : n, next: i + 3 };
}

/** Three spoken digits for IAS. Out-of-range values are left for the pilot. */
export function parseSpeedKt(
  tokens: readonly string[],
  i: number,
): { value: number; next: number } | null {
  const a = singleDigit(tokens[i]);
  const b = singleDigit(tokens[i + 1]);
  const c = singleDigit(tokens[i + 2]);
  if (a === null || b === null || c === null) {
    return null;
  }
  return { value: a * 100 + b * 10 + c, next: i + 3 };
}

/**
 * Thousands / thousand+hundred (`three thousand`, `one one thousand`).
 * Optional trailing `feet`. Does not clamp.
 */
export function parseAltitudeFt(
  tokens: readonly string[],
  i: number,
): { value: number; next: number } | null {
  let j = i;
  const parts: number[] = [];
  while (j < tokens.length) {
    const tok = tokens[j]!;
    if (tok === "thousand" || tok === "hundred" || tok === "feet" || tok === "and") {
      break;
    }
    const grouped = groupedNumberToken(tok);
    if (grouped === null) {
      break;
    }
    let value = grouped;
    j += 1;
    if (tok in TENS) {
      const ones = singleDigit(tokens[j]);
      if (ones !== null) {
        value += ones;
        j += 1;
      }
    }
    parts.push(value);
  }
  if (parts.length === 0) {
    return null;
  }

  if (tokens[j] === "thousand") {
    const thousands = combineThousandsGroup(parts);
    j += 1;
    if (tokens[j] === "and") {
      j += 1;
    }
    let rest = 0;
    const hundredsDigit = singleDigit(tokens[j]);
    if (hundredsDigit !== null && tokens[j + 1] === "hundred") {
      rest = hundredsDigit * 100;
      j += 2;
    }
    if (tokens[j] === "feet") {
      j += 1;
    }
    return { value: thousands * 1000 + rest, next: j };
  }

  if (tokens[j] === "hundred" && parts.length === 1) {
    j += 1;
    if (tokens[j] === "feet") {
      j += 1;
    }
    return { value: parts[0]! * 100, next: j };
  }

  return null;
}

function combineThousandsGroup(parts: number[]): number {
  if (parts.every((part) => part >= 0 && part <= 9)) {
    return Number(parts.join(""));
  }
  if (parts.length === 1) {
    return parts[0]!;
  }
  return Number(parts.join(""));
}

/** Turn amount: `twenty`, `two zero`, or a raw integer. */
export function parseTurnDegreesValue(
  tokens: readonly string[],
  i: number,
): { value: number; next: number } | null {
  const tok = tokens[i];
  if (tok === undefined) {
    return null;
  }
  if (/^\d+$/.test(tok)) {
    return { value: Number(tok), next: i + 1 };
  }
  if (tok in TENS) {
    const ones = singleDigit(tokens[i + 1]);
    if (ones !== null) {
      return { value: TENS[tok]! + ones, next: i + 2 };
    }
    return { value: TENS[tok]!, next: i + 1 };
  }
  if (tok in TEENS) {
    return { value: TEENS[tok]!, next: i + 1 };
  }
  const a = singleDigit(tok);
  const b = singleDigit(tokens[i + 1]);
  if (a !== null && b !== null) {
    return { value: a * 10 + b, next: i + 2 };
  }
  if (a !== null) {
    return { value: a, next: i + 1 };
  }
  return null;
}

export function countNumberWordsFrom(tokens: readonly string[], start: number): number {
  let n = 0;
  for (let i = start; i < tokens.length; i += 1) {
    if (!isNumberish(tokens[i])) {
      break;
    }
    n += 1;
  }
  return n;
}
