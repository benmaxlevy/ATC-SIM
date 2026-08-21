/**
 * AudioWorklet processor source. Runs off the main thread.
 *
 * Armed via port messages `{ type: "arm" | "disarm" }`. While armed, copies
 * input floats (mixed to mono) to the main thread. The main thread still
 * concatenates only while PTT is down.
 *
 * Loaded as a blob URL (`createPcmWorkletBlobUrl`) — this repo has no other
 * worker loader yet.
 */

export const PCM_CAPTURE_PROCESSOR = "pcm-capture";

export const PCM_CAPTURE_WORKLET_SOURCE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.armed = false;
    this.port.onmessage = (event) => {
      const type = event.data && event.data.type;
      if (type === "arm") this.armed = true;
      else if (type === "disarm") this.armed = false;
    };
  }

  process(inputs) {
    if (!this.armed) return true;
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const ch0 = input[0];
    if (!ch0 || ch0.length === 0) return true;
    var mono;
    if (input.length === 1) {
      mono = ch0.slice();
    } else {
      mono = new Float32Array(ch0.length);
      var nCh = input.length;
      for (var i = 0; i < ch0.length; i++) {
        var sum = 0;
        for (var c = 0; c < nCh; c++) {
          var ch = input[c];
          sum += ch && ch[i] ? ch[i] : 0;
        }
        mono[i] = sum / nCh;
      }
    }
    this.port.postMessage(mono);
    return true;
  }
}

registerProcessor("${PCM_CAPTURE_PROCESSOR}", PcmCaptureProcessor);
`;

export function createPcmWorkletBlobUrl(): string {
  const blob = new Blob([PCM_CAPTURE_WORKLET_SOURCE], { type: "application/javascript" });
  return URL.createObjectURL(blob);
}
