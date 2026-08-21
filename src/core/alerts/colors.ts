/**
 * Datablock / target tint priority (phase 4 README):
 * `CA alert > MSAW alert > CA caution > MSAW caution > ownership`.
 *
 * MSAW slots are here so T04-10 can plug in without renaming. This ticket
 * does not evaluate MSAW.
 */

export type AlertTint = "ca-alert" | "msaw-alert" | "ca-caution" | "msaw-caution" | null;

export interface AlertTintTrack {
  ca?: "alert" | "caution" | null;
  msaw?: "alert" | "caution" | null;
}

/**
 * Highest-priority alert tint for a track. Scope maps this to paint colors;
 * it must not recompute conflict geometry.
 */
export function datablockAlertTint(track: AlertTintTrack): AlertTint {
  if (track.ca === "alert") {
    return "ca-alert";
  }
  if (track.msaw === "alert") {
    return "msaw-alert";
  }
  if (track.ca === "caution") {
    return "ca-caution";
  }
  if (track.msaw === "caution") {
    return "msaw-caution";
  }
  return null;
}
