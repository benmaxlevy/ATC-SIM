import { expect, test } from "vitest";
import { SessionLog, createAircraft, createWorld } from "@core";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { submitCommand } from "./submitCommand";

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

test("AC1 — DAL123 H270 readback contains heading two seven zero, not the raw token as the only output", () => {
  const dal = sample("DAL123");
  const world = createWorld({ aircraft: [dal] });
  const result = submitCommand(world, "DAL123 H270", new SessionLog());

  expect(result.accepted).toBe(true);
  expect(result.readback.toLowerCase()).toContain("heading two seven zero");
  expect(result.readback.trim().toUpperCase()).not.toBe("DAL123 H270");
  expect(result.readback.trim().toUpperCase()).not.toBe("H270");
  expect(result.command?.source).toBe("text");
  expect(dal.intent.assignedHeadingDeg).toBe(270);
});

test("spawned KDEM DAL123 accepts H270 before PPI exists", () => {
  const world = createWorldFromScenario(loadKdem());
  const result = submitCommand(world, "DAL123 H270", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(result.readback.toLowerCase()).toContain("heading two seven zero");
  const dal = world.aircraft.find((ac) => ac.callsign === "DAL123");
  expect(dal?.intent.assignedHeadingDeg).toBe(270);
});

test("AC3 — XYZ H270 is unable; existing aircraft keep prior intent", () => {
  const dal = sample("DAL123", { headingDeg: 100 });
  const before = { ...dal.intent };
  const world = createWorld({ aircraft: [dal] });
  const result = submitCommand(world, "XYZ H270", new SessionLog());

  expect(result.accepted).toBe(false);
  expect(result.readback.toLowerCase()).toContain("unable");
  expect(dal.intent).toEqual(before);
  expect(dal.intent.assignedHeadingDeg).toBe(100);
});

test("empty submit matches T01-07 parse reject and does not crash", () => {
  const dal = sample("DAL123");
  const before = { ...dal.intent };
  const world = createWorld({ aircraft: [dal] });
  const result = submitCommand(world, "", new SessionLog());
  expect(result.accepted).toBe(false);
  expect(result.readback.toLowerCase()).toContain("unable");
  expect(dal.intent).toEqual(before);
});

test("AC4 — submitCommand source does not call SpeechPort methods", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const submitSrc = sources["./submitCommand.ts"];
  expect(submitSrc).toBeDefined();
  expect(submitSrc).not.toMatch(/\.transcribe\s*\(/);
  expect(submitSrc).not.toMatch(/\.synthesize\s*\(/);
  expect(submitSrc).not.toMatch(/from\s+["']@speech["']/);
  expect(submitSrc).not.toMatch(/\bstepWorld\b/);
  expect(submitSrc).not.toMatch(/\badvanceWorld\b/);
  expect(submitSrc).toMatch(/handleRadioText/);
});

test("AC7 — shell calls submitCommand; command line clears after submit", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const shell = sources["./shell.tsx"];
  const commandLine = sources["./command-line.tsx"];
  expect(shell).toBeDefined();
  expect(commandLine).toBeDefined();
  expect(shell).toMatch(/from\s+["']\.\/submitCommand["']/);
  expect(shell).toMatch(/submitCommand\(/);
  expect(shell).not.toMatch(/submitCommandLine/);
  expect(shell).not.toMatch(/\.transcribe\s*\(/);
  expect(shell).not.toMatch(/\.synthesize\s*\(/);
  expect(shell).not.toMatch(/\bstepWorld\b/);
  expect(commandLine).toMatch(/onSubmit\(value\)/);
  expect(commandLine).toMatch(/setValue\(""\)/);
});

test("T01-11 — canvas click selects then focuses the PPI; it does not submit a radio command", () => {
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const shell = sources["./shell.tsx"];
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
  const sources = import.meta.glob("./*.{ts,tsx}", {
    query: "?raw",
    import: "default",
    eager: true,
  }) as Record<string, string>;
  const shell = sources["./shell.tsx"]!;
  const canvas = sources["./ScopeCanvas.tsx"]!;
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
