/** Shared semantic order for the compact IFR-clearance optional fields. */
export type IfrClearanceField = "ALT" | "CVIA" | "FREQ" | "SQ";

const FIELD_RANK: Record<IfrClearanceField, number> = {
  ALT: 0,
  CVIA: 1,
  FREQ: 2,
  SQ: 3,
};

const FIELD_ALIASES: Readonly<Record<string, IfrClearanceField>> = {
  ALT: "ALT",
  MAINTAIN: "ALT",
  CVIA: "CVIA",
  FREQ: "FREQ",
  FREQUENCY: "FREQ",
  SQ: "SQ",
  SQUAWK: "SQ",
};

export interface IfrClearanceFieldOrder {
  lastRank: number;
  seen: ReadonlySet<IfrClearanceField>;
}

export function newIfrClearanceFieldOrder(): { lastRank: number; seen: Set<IfrClearanceField> } {
  return { lastRank: -1, seen: new Set<IfrClearanceField>() };
}

export function ifrClearanceField(token: string | undefined): IfrClearanceField | null {
  if (!token) return null;
  return FIELD_ALIASES[token.toUpperCase()] ?? null;
}

/** Reject aliases duplicated or appearing before an earlier semantic field. */
export function acceptIfrClearanceField(
  state: { lastRank: number; seen: Set<IfrClearanceField> },
  token: string,
): IfrClearanceField | null {
  const field = ifrClearanceField(token);
  if (!field || state.seen.has(field) || FIELD_RANK[field] <= state.lastRank) {
    return null;
  }
  state.seen.add(field);
  state.lastRank = FIELD_RANK[field];
  return field;
}
