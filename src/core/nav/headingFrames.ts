/** A controller-facing or published course, expressed in magnetic degrees. */
export type MagneticHeadingDeg = number & { readonly __headingFrame: "magnetic" };

/** An ENU/world geometric axis, expressed in true degrees. */
export type TrueHeadingDeg = number & { readonly __headingFrame: "true" };

/** Normalize a heading to the half-open interval [0, 360). */
function normalize(degrees: number): number {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

/** Convert a magnetic command/published heading to the true ENU axis. */
export function magneticToTrueDeg(
  magneticDeg: MagneticHeadingDeg | number,
  magVarDeg: number,
): TrueHeadingDeg {
  return normalize(magneticDeg + magVarDeg) as TrueHeadingDeg;
}

/** Convert a true ENU axis to a magnetic command/published heading. */
export function trueToMagneticDeg(
  trueDeg: TrueHeadingDeg | number,
  magVarDeg: number,
): MagneticHeadingDeg {
  return normalize(trueDeg - magVarDeg) as MagneticHeadingDeg;
}
