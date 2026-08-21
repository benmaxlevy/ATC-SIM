/**
 * PTT transmit lock (no barge-in, no queue). Pure state machine — no AudioContext.
 *
 * Locked from PTT-down (or STT start) until idle: no in-flight transcribe/parse
 * and no playing source. T03-01 `setTransmitLocked` follows {@link TransmitGate.locked}.
 */

export type TransmitGateState = "idle" | "armed" | "working" | "playing";

export type TransmitGateEvent =
  "ptt-down" | "working" | "play-started" | "play-ended" | "utterance-failed";

export class TransmitGate {
  private state: TransmitGateState = "idle";

  get current(): TransmitGateState {
    return this.state;
  }

  /** Ignore PTT while not idle. */
  get locked(): boolean {
    return this.state !== "idle";
  }

  get idle(): boolean {
    return this.state === "idle";
  }

  apply(event: TransmitGateEvent): boolean {
    switch (event) {
      case "ptt-down":
        if (this.state === "idle") {
          this.state = "armed";
        }
        break;
      case "working":
        if (this.state === "idle" || this.state === "armed") {
          this.state = "working";
        }
        break;
      case "play-started":
        this.state = "playing";
        break;
      case "play-ended":
      case "utterance-failed":
        this.state = "idle";
        break;
    }
    return this.locked;
  }
}
