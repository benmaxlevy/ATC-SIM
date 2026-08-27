import { expect, test } from "vitest";
import { TransmitGate } from "./readback-player";

test("down → stt → play → end → idle (AC6)", () => {
  const gate = new TransmitGate();
  expect(gate.current).toBe("idle");
  expect(gate.locked).toBe(false);

  expect(gate.apply("ptt-down")).toBe(true);
  expect(gate.current).toBe("armed");

  expect(gate.apply("working")).toBe(true);
  expect(gate.current).toBe("working");

  expect(gate.apply("play-started")).toBe(true);
  expect(gate.current).toBe("playing");

  expect(gate.apply("play-ended")).toBe(false);
  expect(gate.current).toBe("idle");
  expect(gate.idle).toBe(true);
});

test("utterance-failed after PTT-down returns to idle (empty / STT / parse miss)", () => {
  const gate = new TransmitGate();
  gate.apply("ptt-down");
  expect(gate.apply("utterance-failed")).toBe(false);
  expect(gate.idle).toBe(true);
});

test("fail-after-accept (synthesize reject) unlocks from working without a stuck lock (AC4)", () => {
  const gate = new TransmitGate();
  gate.apply("working");
  expect(gate.locked).toBe(true);
  expect(gate.apply("utterance-failed")).toBe(false);
  expect(gate.current).toBe("idle");
});

test("fail-after-accept while playing still unlocks", () => {
  const gate = new TransmitGate();
  gate.apply("working");
  gate.apply("play-started");
  expect(gate.apply("utterance-failed")).toBe(false);
  expect(gate.idle).toBe(true);
});

test("ptt-down while already locked does not queue a second utterance", () => {
  const gate = new TransmitGate();
  gate.apply("working");
  gate.apply("ptt-down");
  expect(gate.current).toBe("working");
  expect(gate.locked).toBe(true);
});

test("working without a prior ptt-down still locks (voice-loop tests that skip down)", () => {
  const gate = new TransmitGate();
  expect(gate.apply("working")).toBe(true);
  expect(gate.current).toBe("working");
});
