import { expect, expectTypeOf, test } from "vitest";
import { fixtureFlyHeading } from "../command/fixtures";
import type { Command } from "../command/types";
import { SessionLog } from "./session-log";
import type { SessionEvent } from "./types";

const emptyInstructionCommand: Command = {
  id: "cmd-empty",
  issuedAtSimMs: 0,
  callsign: "DAL123",
  instructions: [],
  sourceText: "DAL123",
  source: "text",
};

test("SessionEvent includes command events, voice.latency, CA edges, MSAW edges, and nav FMS", () => {
  expectTypeOf<SessionEvent["type"]>().toEqualTypeOf<
    | "session.started"
    | "command.accepted"
    | "command.rejected"
    | "voice.latency"
    | "alert.ca.caution"
    | "alert.ca.alert"
    | "alert.ca.clear"
    | "alert.msaw.caution"
    | "alert.msaw.alert"
    | "alert.msaw.clear"
    | "nav.direct.sequenced"
    | "nav.star.vectors"
    | "nav.constraint.met"
    | "nav.loc.captured"
    | "nav.gs.captured"
    | "nav.missed.started"
    | "handoff.tower"
    | "nav.landed"
  >();
});

test("command.rejected requires reason and command (AC2)", () => {
  type Rejected = Extract<SessionEvent, { type: "command.rejected" }>;
  expectTypeOf<Rejected>().toEqualTypeOf<{
    type: "command.rejected";
    atSimMs: number;
    atWallMs: number;
    command: Command | null;
    reason: string;
    sourceText?: string;
  }>();

  const rejected: Rejected = {
    type: "command.rejected",
    atSimMs: 0,
    atWallMs: 1_000,
    command: emptyInstructionCommand,
    reason: "empty instruction list",
  };
  expect(rejected.reason).toBe("empty instruction list");
  expect(rejected.command?.instructions).toEqual([]);
});

test("parse failures may log command.rejected with command null and sourceText (T01-07)", () => {
  const log = new SessionLog();
  log.append({
    type: "command.rejected",
    atSimMs: 0,
    atWallMs: 1_000,
    command: null,
    reason: "PARSE",
    sourceText: "not a token",
  });
  const rejected = log.byType("command.rejected")[0];
  expect(rejected?.command).toBeNull();
  expect(rejected?.reason).toBe("PARSE");
  expect(rejected?.sourceText).toBe("not a token");
});

test("appending accepted then rejected preserves insertion order (AC3)", () => {
  const log = new SessionLog();
  log.append({
    type: "command.accepted",
    atSimMs: 10,
    atWallMs: 1_000,
    command: fixtureFlyHeading,
  });
  log.append({
    type: "command.rejected",
    atSimMs: 20,
    atWallMs: 1_001,
    command: emptyInstructionCommand,
    reason: "empty instruction list",
  });

  const events = log.all();
  expect(events).toHaveLength(2);
  expect(events[0]?.type).toBe("command.accepted");
  expect(events[1]?.type).toBe("command.rejected");
});

test("mutating all() does not change a subsequent all() (AC4)", () => {
  const log = new SessionLog();
  log.append({
    type: "session.started",
    atSimMs: 0,
    atWallMs: 1_000,
    scenarioId: "kdem",
    seed: 1,
  });
  log.append({
    type: "command.accepted",
    atSimMs: 10,
    atWallMs: 1_001,
    command: fixtureFlyHeading,
  });

  const snapshot = log.all() as SessionEvent[];
  snapshot.push({
    type: "command.rejected",
    atSimMs: 20,
    atWallMs: 1_002,
    command: emptyInstructionCommand,
    reason: "empty instruction list",
  });
  snapshot.reverse();

  const next = log.all();
  expect(next).toHaveLength(2);
  expect(next[0]?.type).toBe("session.started");
  expect(next[1]?.type).toBe("command.accepted");
});

test("byType returns only matching events (AC5)", () => {
  const log = new SessionLog();
  log.append({
    type: "session.started",
    atSimMs: 0,
    atWallMs: 1_000,
    scenarioId: "kdem",
    seed: 1,
  });
  log.append({
    type: "command.accepted",
    atSimMs: 10,
    atWallMs: 1_001,
    command: fixtureFlyHeading,
  });
  log.append({
    type: "command.rejected",
    atSimMs: 20,
    atWallMs: 1_002,
    command: emptyInstructionCommand,
    reason: "empty instruction list",
  });
  log.append({
    type: "command.rejected",
    atSimMs: 30,
    atWallMs: 1_003,
    command: fixtureFlyHeading,
    reason: "unknown callsign",
  });

  const rejected = log.byType("command.rejected");
  expect(rejected).toHaveLength(2);
  expect(rejected.every((event) => event.type === "command.rejected")).toBe(true);
  expect(rejected.map((event) => event.reason)).toEqual([
    "empty instruction list",
    "unknown callsign",
  ]);
  expectTypeOf(rejected).toEqualTypeOf<Extract<SessionEvent, { type: "command.rejected" }>[]>();
});

test("voice.latency appends wall-clock PTT marks (T03-09)", () => {
  const log = new SessionLog();
  log.append({
    type: "voice.latency",
    atSimMs: 10,
    atWallMs: 1_000,
    pttUpToTranscriptMs: 40,
    pttUpToAudioStartMs: 180,
    backendId: "http",
  });
  log.append({
    type: "voice.latency",
    atSimMs: 20,
    atWallMs: 1_001,
    pttUpToTranscriptMs: 75,
    pttUpToAudioStartMs: null,
    backendId: "http",
  });
  const latencies = log.byType("voice.latency");
  expect(latencies).toHaveLength(2);
  expect(latencies[0]?.pttUpToAudioStartMs).toBe(180);
  expect(latencies[1]?.pttUpToAudioStartMs).toBeNull();
  expect(latencies[1]?.pttUpToTranscriptMs).toBe(75);
});
