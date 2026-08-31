import { expect, test } from "vitest";
import { SessionLog, acceptInboundHandoff, createAircraft, createWorld } from "@core";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { echoCommandLine, submitCommand, submitCommandLine } from "../command/command-line";

function sample(callsign: string, extras: Partial<Parameters<typeof createAircraft>[0]> = {}) {
  return createAircraft({
    id: extras.id ?? `ac-${callsign.toLowerCase()}`,
    callsign,
    xNm: extras.xNm ?? 10,
    yNm: extras.yNm ?? 5,
    headingDeg: extras.headingDeg ?? 100,
    altitudeFt: extras.altitudeFt ?? 8000,
    speedKt: extras.speedKt ?? 220,
  });
}

test('echoCommandLine("  H270  ") === "H270" (AC5)', () => {
  expect(echoCommandLine("  H270  ")).toBe("H270");
});

test("echoCommandLine on whitespace does not throw (AC5)", () => {
  expect(() => echoCommandLine("   ")).not.toThrow();
  expect(echoCommandLine("   ")).toBe("");
});

test("submitCommandLine ignores empty trim (AC5)", () => {
  expect(submitCommandLine("H270", "   ")).toBe("H270");
  expect(submitCommandLine("", "   ")).toBe("");
  expect(submitCommandLine("old", "  hello  ")).toBe("hello");
});

test("AC1 — DAL123 H270 readback contains heading 270, not the raw token as the only output", async () => {
  const dal = sample("DAL123");
  const world = createWorld({ aircraft: [dal] });
  const result = await submitCommand(world, "DAL123 H270", new SessionLog());

  expect(result.accepted).toBe(true);
  expect(result.readback).toContain("heading 270");
  expect(result.readback.trim().toUpperCase()).not.toBe("DAL123 H270");
  expect(result.readback.trim().toUpperCase()).not.toBe("H270");
  expect(result.command?.source).toBe("text");
  expect(dal.intent.assignedHeadingDeg).toBe(270);
});

test("spawned KDEM DAL123 rejects H270 until inbound HO is accepted (no PPI)", async () => {
  const world = createWorldFromScenario(loadKdem());
  const rejected = await submitCommand(world, "DAL123 H270", new SessionLog());
  expect(rejected.accepted).toBe(false);
  expect(rejected.reason).toBe("handoff-pending");
  expect(world.aircraft.find((ac) => ac.callsign === "DAL123")?.intent.assignedHeadingDeg).not.toBe(
    270,
  );

  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123")!;
  acceptInboundHandoff(world, dal.id);
  const result = await submitCommand(world, "DAL123 H270", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(result.readback).toContain("heading 270");
  expect(dal.intent.assignedHeadingDeg).toBe(270);
});

test("AC3 — XYZ H270 is unable; existing aircraft keep prior intent", async () => {
  const dal = sample("DAL123", { headingDeg: 100 });
  const before = { ...dal.intent };
  const world = createWorld({ aircraft: [dal] });
  const result = await submitCommand(world, "XYZ H270", new SessionLog());

  expect(result.accepted).toBe(false);
  expect(result.readback.toLowerCase()).toContain("unable");
  expect(dal.intent).toEqual(before);
  expect(dal.intent.assignedHeadingDeg).toBe(100);
});

test("empty submit matches T01-07 parse reject and does not crash", async () => {
  const dal = sample("DAL123");
  const before = { ...dal.intent };
  const world = createWorld({ aircraft: [dal] });
  const result = await submitCommand(world, "", new SessionLog());
  expect(result.accepted).toBe(false);
  expect(result.readback.toLowerCase()).toContain("unable");
  expect(dal.intent).toEqual(before);
});

test("AC4 — submitCommand source does not call SpeechPort methods", () => {
  const sources = import.meta.glob(["../*.{ts,tsx}", "../**/*.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const submitSrc = sources["../command/command-line.tsx"];
  expect(submitSrc).toBeDefined();
  expect(submitSrc).not.toMatch(/\.transcribe\s*\(/);
  expect(submitSrc).not.toMatch(/\.synthesize\s*\(/);
  expect(submitSrc).not.toMatch(/from\s+["']@speech["']/);
  expect(submitSrc).not.toMatch(/\bstepWorld\b/);
  expect(submitSrc).not.toMatch(/\badvanceWorld\b/);
  expect(submitSrc).toMatch(/handleRadioText/);
});

test("AC7 — shell calls submitCommand; command line clears after submit", () => {
  const sources = import.meta.glob(["../*.{ts,tsx}", "../**/*.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const shell = sources["../shell.tsx"];
  const commandLine = sources["../command/command-line.tsx"];
  expect(shell).toBeDefined();
  expect(commandLine).toBeDefined();
  expect(shell).toMatch(/from\s+["']\.\/command\/command-line["']/);
  expect(shell).toMatch(/submitCommand\(/);
  expect(shell).toMatch(/playReadback/);
  expect(shell).not.toMatch(/submitCommandLine/);
  expect(shell).not.toMatch(/\.transcribe\s*\(/);
  expect(shell).not.toMatch(/\.synthesize\s*\(/);
  expect(shell).not.toMatch(/\bstepWorld\b/);
  expect(commandLine).toMatch(/onSubmit\(value\)/);
  expect(commandLine).toMatch(/setValue\(""\)/);
  expect(commandLine).toMatch(/voiceStatus/);
  expect(shell).toMatch(/subscribeVoiceStatus/);
  expect(shell).toMatch(/voiceStatus=\{voiceStatus\}/);
  expect(shell).not.toMatch(/\balert\s*\(/);
});

test("T01-11 — canvas click selects then focuses the PPI; it does not submit a radio command", () => {
  const sources = import.meta.glob(["../*.{ts,tsx}", "../**/*.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const shell = sources["../shell.tsx"];
  expect(shell).toBeDefined();
  expect(shell).toMatch(/handlePpiCanvasClick/);
  expect(shell).toMatch(/currentTarget\.focus/);
  expect(shell).not.toMatch(/focusCommandLine/);
  expect(shell).toMatch(/onCanvasClick/);
  const clickHandler = shell!.slice(
    shell!.indexOf("onCanvasClick"),
    shell!.indexOf("onCanvasDoubleClick"),
  );
  expect(clickHandler).not.toMatch(/submitCommand/);
  expect(clickHandler).not.toMatch(/setReadback/);
});

test("AC5 — command line stays at the bottom of the PPI column; disclaimer is not a banner sibling", () => {
  const sources = import.meta.glob(["../*.{ts,tsx}", "../**/*.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const shell = sources["../shell.tsx"]!;
  const canvas = sources["../canvas/ScopeCanvas.tsx"]!;
  const disclaimerIdx = shell.indexOf("<Disclaimer");
  const commandLineIdx = shell.indexOf("<CommandLine");
  const scopeWorkIdx = shell.indexOf("scope-work");
  expect(disclaimerIdx).toBeGreaterThan(-1);
  expect(commandLineIdx).toBeGreaterThan(-1);
  expect(disclaimerIdx).toBeGreaterThan(scopeWorkIdx);
  expect(commandLineIdx).toBeGreaterThan(shell.indexOf("footer="));
  expect(canvas).toMatch(/footer\?:/);
  expect(canvas).toMatch(/\{footer\}/);
});
