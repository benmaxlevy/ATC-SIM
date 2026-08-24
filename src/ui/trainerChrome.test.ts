import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
// @ts-expect-error tsconfig has no @types/node
import { readFileSync } from "node:fs";
import { SessionLog, createAircraft, createWorld } from "@core";
import { HELP_FOOTER } from "@scope";
import { DISCLAIMER_COPY, DISCLAIMER_DISMISSED_KEY } from "./disclaimer-copy";
import { Disclaimer } from "./disclaimer";
import { submitCommand } from "./submitCommand";

const uiSources = import.meta.glob("./*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function shellSrc(): string {
  return uiSources["./shell.tsx"]!;
}

function cssSrc(): string {
  return readFileSync(new URL("../index.css", import.meta.url), "utf8");
}

function sample() {
  return createAircraft({
    id: "ac-dal",
    callsign: "DAL123",
    xNm: 10,
    yNm: 5,
    headingDeg: 100,
    altitudeFt: 8000,
    speedKt: 220,
  });
}

function memoryStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    get length() {
      return mem.size;
    },
    clear() {
      mem.clear();
    },
    getItem(key) {
      return mem.get(key) ?? null;
    },
    key(index) {
      return [...mem.keys()][index] ?? null;
    },
    removeItem(key) {
      mem.delete(key);
    },
    setItem(key, value) {
      mem.set(key, value);
    },
  };
}

test("AC1 — no disclaimer banner over the DCB; T00-01 copy is first-run and F1", () => {
  const shell = shellSrc();
  const css = cssSrc();
  const overlay = uiSources["./ScopeHelpOverlay.tsx"]!;
  const disclaimer = uiSources["./disclaimer.tsx"]!;

  expect(shell.indexOf("<Disclaimer")).toBeGreaterThan(shell.indexOf("<ScopeCanvas"));
  expect(shell.indexOf("<Disclaimer")).toBeGreaterThan(shell.indexOf("<SimControls"));
  expect(css).not.toMatch(/\.disclaimer\s*\{[^}]*flex:\s*0 0 auto/s);
  expect(css).toMatch(/\.disclaimer-first-run\s*\{[^}]*position:\s*absolute/s);
  expect(disclaimer).toMatch(/DISCLAIMER_COPY/);
  expect(disclaimer).toMatch(/Dismiss/);
  expect(overlay).toMatch(/DISCLAIMER_COPY/);

  const store = memoryStorage();
  const firstRun = renderToStaticMarkup(createElement(Disclaimer, { storage: store }));
  expect(firstRun).toContain(DISCLAIMER_COPY);
  expect(firstRun).toContain("disclaimer-first-run");
  store.setItem(DISCLAIMER_DISMISSED_KEY, "1");
  expect(renderToStaticMarkup(createElement(Disclaimer, { storage: store }))).toBe("");
});

test("AC2 — persistent chrome has no tutorial sentences; F1 still lists TRAINER KEYS", () => {
  const shell = shellSrc();
  const controls = uiSources["./sim-controls.tsx"]!;
  const overlay = uiSources["./ScopeHelpOverlay.tsx"]!;
  expect(shell).not.toMatch(/HELP_KEYS_POINTER/);
  expect(shell).not.toMatch(/INITIATE_TRACK_HELP/);
  expect(shell).not.toMatch(/DROP_TRACK_HELP/);
  expect(shell).not.toMatch(/ownership-help/);
  expect(controls).not.toMatch(/PLAY_HINT/);
  expect(controls).not.toMatch(/play-hint/);
  expect(controls).not.toMatch(/sim-keys/);
  expect(overlay).toMatch(/HELP_FOOTER/);
  expect(HELP_FOOTER).toBe("TRAINER KEYS — NOT CRC");
});

test("AC3 — Pause / 1× / 2× still mutate paused and simRate", () => {
  const controls = uiSources["./sim-controls.tsx"]!;
  expect(shellSrc()).toMatch(/<SimControls/);
  expect(controls).toMatch(/>\s*Pause\s*</);
  expect(controls).toMatch(/>\s*1×\s*</);
  expect(controls).toMatch(/>\s*2×\s*</);
  expect(controls).toMatch(/setPaused\(world,\s*!world\.paused\)/);
  expect(controls).toMatch(/setSimRate\(world,\s*1\)/);
  expect(controls).toMatch(/setSimRate\(world,\s*2\)/);
  expect(cssSrc()).toMatch(/\.sim-controls\s*\{[^}]*position:\s*absolute/s);
  expect(cssSrc()).toMatch(/\.sim-controls\s*\{[^}]*color:\s*#00ff00/s);
});

test("AC4 — radio-focus DAL123 H270 still readbacks and turns", async () => {
  const dal = sample();
  const world = createWorld({ aircraft: [dal] });
  const result = await submitCommand(world, "DAL123 H270", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(result.readback).toContain("heading 270");
  expect(dal.intent.assignedHeadingDeg).toBe(270);
  expect(shellSrc()).toMatch(/submitCommand\(/);
});

test("AC5 — command strip does not call parseCommand; typed English wins at Path A", async () => {
  const commandLine = uiSources["./command-line.tsx"]!;
  const submit = uiSources["./submitCommand.ts"]!;
  expect(commandLine).not.toMatch(/parseCommand/);
  expect(commandLine).not.toMatch(/spoken_a/);
  expect(commandLine).toMatch(/placeholder="DAL123 H270"/);
  expect(submit).toMatch(/handleRadioText/);
  expect(submit).not.toMatch(/parseCommand/);

  const dal = sample();
  const world = createWorld({ aircraft: [dal] });
  const result = await submitCommand(world, "DAL123 fly heading two seven zero", new SessionLog());
  expect(result.accepted).toBe(true);
  expect(result.command?.parseStage).toBe("spoken_a");
  expect(dal.intent.assignedHeadingDeg).toBe(270);
});

test("AC6 — shell analog+delta; no user-facing HUD / zoom / toolbar", () => {
  const shell = shellSrc();
  expect(shell).toMatch(/Analog: CRC\/vNAS STARS TCW/);
  expect(shell).toMatch(/Trainer delta:/);
  expect(shell).toMatch(/R07/);
  expect(shell).toMatch(/R12/);
  expect(shell).toMatch(/Not NAS STARS/);

  const commandLine = uiSources["./command-line.tsx"]!;
  const controls = uiSources["./sim-controls.tsx"]!;
  const disclaimer = uiSources["./disclaimer.tsx"]!;
  expect(commandLine).toMatch(/aria-label="Command line"/);
  expect(commandLine).toMatch(/placeholder="DAL123 H270"/);
  expect(commandLine.toLowerCase()).not.toMatch(/aria-label="[^"]*\b(hud|zoom|toolbar)\b/);
  expect(commandLine.toLowerCase()).not.toMatch(/placeholder="[^"]*\b(hud|zoom|toolbar)\b/);
  expect(controls).toMatch(/aria-label="Sim rate"/);
  expect(controls.toLowerCase()).not.toMatch(/aria-label="[^"]*\b(hud|zoom|toolbar)\b/);
  expect(disclaimer).toMatch(/aria-label="Training disclaimer"/);
  expect(disclaimer.toLowerCase()).not.toMatch(/aria-label="[^"]*\b(hud|zoom|toolbar)\b/);
  // Physical DCB caps intentionally use inset bevel shadows; other trainer
  // chrome remains flat and shadow-free.
  expect(cssSrc()).toMatch(/\.dcb-cell[\s\S]*inset 1px 1px var\(--dcb-highlight/);
  const nonDcbCss = cssSrc().replace(/\.dcb-cell[^{]*\{[^}]*\}/g, "");
  const shadows = [...nonDcbCss.matchAll(/box-shadow:\s*([^;]+)/g)].map((m) => m[1].trim());
  expect(shadows.every((value) => value === "none")).toBe(true);
});
