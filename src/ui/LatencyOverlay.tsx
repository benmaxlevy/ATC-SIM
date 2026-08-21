import type { VoiceSessionSnapshot } from "@speech";
import {
  LATENCY_OVERLAY_ID,
  formatLatencyOverlay,
  latencyOverlayClassName,
} from "./latency-overlay";

export interface LatencyOverlayProps {
  snapshot: VoiceSessionSnapshot;
  visible: boolean;
  /** Session toggle. T03-10 may persist; default on. */
  onToggle?: (visible: boolean) => void;
}

/**
 * Last utterance + session p50. Hidden when `visible` is false (T03-10 toggle).
 * Not a DCB. Not drawn on the PPI canvas.
 */
export function LatencyOverlay({ snapshot, visible, onToggle }: LatencyOverlayProps) {
  if (!visible) {
    if (!onToggle) {
      return null;
    }
    return (
      <button
        type="button"
        className="latency-overlay-toggle"
        aria-label="Show voice latency"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onToggle(true)}
      >
        LAT
      </button>
    );
  }
  return (
    <div
      id={LATENCY_OVERLAY_ID}
      className={latencyOverlayClassName(snapshot.backendId, snapshot.p50AudioStartMs)}
      aria-label="Voice latency"
    >
      <span>{formatLatencyOverlay(snapshot)}</span>
      {onToggle ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onToggle(false)}
          aria-label="Hide voice latency"
        >
          Hide
        </button>
      ) : null}
    </div>
  );
}
