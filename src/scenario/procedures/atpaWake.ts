import type { CwtWakeCategory } from "@core";
import type { AtpaWakeAdaptation, AtpaWakeMatrix } from "./types";

/**
 * FAA JO 7110.65 §5-5-4, TBL 5-5-1 reviewed terminal wake adaptation.
 * Rows are the leading aircraft; columns are the following aircraft.
 * Blank FAA cells are omitted. Trainer policy resolves an omitted required
 * relationship as NOWGT with 10 NM, per §5-5-4.
 */
export const FAA_CWT_WAKE_MATRIX: AtpaWakeMatrix = {
  A: { B: 5, C: 6, D: 6, E: 7, F: 7, G: 7, H: 8, I: 8 },
  B: { B: 3, C: 4, D: 4, E: 5, F: 5, G: 5, H: 5, I: 5 },
  C: { E: 3.5, F: 3.5, G: 3.5, H: 5, I: 5 },
  D: { B: 3, C: 4, D: 4, E: 5, F: 5, G: 5, H: 5, I: 5 },
  E: { I: 4 },
};

export const FAA_CWT_WAKE_ADAPTATION: AtpaWakeAdaptation = {
  enabled: true,
  nowgtSeparationNm: 10,
  matrix: FAA_CWT_WAKE_MATRIX,
};

export type AtpaWakeLookup =
  | {
      kind: "wake";
      requiredNm: number;
      leaderCategory: CwtWakeCategory;
      followerCategory: CwtWakeCategory;
    }
  | {
      kind: "nowgt";
      requiredNm: number;
      leaderCategory?: CwtWakeCategory;
      followerCategory?: CwtWakeCategory;
    };

function category(value: unknown): CwtWakeCategory | undefined {
  return typeof value === "string" && /^[A-I]$/.test(value.trim().toUpperCase())
    ? (value.trim().toUpperCase() as CwtWakeCategory)
    : undefined;
}

/** Resolve one explicit leader/follower relationship without aircraft-type inference. */
export function lookupAtpaWakeMinimum(
  adaptation: AtpaWakeAdaptation,
  leaderCategoryValue: unknown,
  followerCategoryValue: unknown,
): AtpaWakeLookup | undefined {
  if (!adaptation.enabled) {
    return undefined;
  }
  const leaderCategory = category(leaderCategoryValue);
  const followerCategory = category(followerCategoryValue);
  if (leaderCategory === undefined || followerCategory === undefined) {
    return {
      kind: "nowgt",
      requiredNm: adaptation.nowgtSeparationNm,
      ...(leaderCategory !== undefined ? { leaderCategory } : {}),
      ...(followerCategory !== undefined ? { followerCategory } : {}),
    };
  }
  const requiredNm = adaptation.matrix[leaderCategory]?.[followerCategory];
  if (requiredNm === undefined) {
    return {
      kind: "nowgt",
      requiredNm: adaptation.nowgtSeparationNm,
      ...(leaderCategory !== undefined ? { leaderCategory } : {}),
      ...(followerCategory !== undefined ? { followerCategory } : {}),
    };
  }
  return {
    kind: "wake",
    requiredNm,
    leaderCategory,
    followerCategory,
  };
}
