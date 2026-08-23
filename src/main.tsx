import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { advanceWorld, createAccumulator } from "@core";
import {
  createWorldForSession,
  loadKdem,
  loadKdemIls27,
  parseScenarioChoice,
  parseSpawnSeed,
  parseTrafficCount,
} from "@scenario";
import { PpiPlaceholderId, createScopeView, paintPpi, parseDigitalMap } from "@scope";
import {
  FPS_DEBUG_ID,
  SIM_HUD_ID,
  Shell,
  formatFpsDebug,
  formatSimHud,
  isFpsDebugEnabled,
  loadAndResolveSpeechBoot,
  syncDisplayControlBar,
  syncStripCallsignColors,
} from "@ui";
import { bootSession } from "./app/boot-session";
import { createApp } from "./app/create-app";
import "./index.css";

const search = window.location.search;
const scenario = parseScenarioChoice(search) === "kdem-ils27" ? loadKdemIls27() : loadKdem();
const spawnSeed = parseSpawnSeed(search);
const speechBoot = loadAndResolveSpeechBoot();
const handles = createApp({
  speech: speechBoot.port,
  speechPrefs: speechBoot.prefs,
  speechUrls: speechBoot.urls,
  world: createWorldForSession(scenario, parseTrafficCount(search), spawnSeed),
});
bootSession(handles, scenario, Date.now(), spawnSeed);
window.addEventListener("pagehide", () => {
  handles.voiceLoop.dispose();
  try {
    handles.speech.dispose?.();
  } catch {
    // Teardown must never throw.
  }
  handles.ptt.dispose();
});

const scopeView = createScopeView(scenario.arpNm.xNm, scenario.arpNm.yNm, {
  digitalMap: parseDigitalMap(scenario.maps),
});

document.title = scenario.id === "kdem-ils27" ? "ATC-SIM — KDEM ILS 27" : "ATC-SIM — KDEM";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <Shell app={handles} scenario={scenario} scopeView={scopeView} />
  </StrictMode>,
);

const acc = createAccumulator();
let lastFrameMs = 0;
const fpsDebugOn = isFpsDebugEnabled(window.location.search);

function paintCurrentPpi(): void {
  const canvas = document.getElementById(PpiPlaceholderId);
  if (canvas instanceof HTMLCanvasElement) {
    paintPpi(canvas, handles.world, scopeView);
  }
  syncStripCallsignColors(scopeView.tracks);
  syncDisplayControlBar(scopeView, handles.world);
}

function onFrame(nowMs: number): void {
  const wallDtS = lastFrameMs === 0 ? 0 : Math.max(0, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;
  // Physics: wall Δt feeds the accumulator. Never pass this dt into stepWorld.
  advanceWorld(handles.world, wallDtS, acc);
  handles.afterPhysicsTick();
  paintCurrentPpi();
  const hud = document.getElementById(SIM_HUD_ID);
  if (hud) {
    hud.textContent = formatSimHud(handles.world);
  }
  if (fpsDebugOn && wallDtS > 0) {
    const fpsHud = document.getElementById(FPS_DEBUG_ID);
    if (fpsHud) {
      fpsHud.textContent = formatFpsDebug(handles.world.aircraft.length, 1 / wallDtS);
    }
  }
  requestAnimationFrame(onFrame);
}

requestAnimationFrame(onFrame);

window.addEventListener("resize", paintCurrentPpi);
