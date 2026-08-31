import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { advanceWorld, createAccumulator } from "@core";
import {
  createWorldForSession,
  loadPlayableScenario,
  parseDepartureOptions,
  parseSpawnSeed,
  parseTrafficCount,
  defaultSessionSetup,
  loadSessionSetup,
  resolveSessionSetup,
} from "@scenario";
import {
  PpiPlaceholderId,
  browserDcbPrefStorage,
  createScopeView,
  ensureWxLevelTiles,
  ensureWxMosaic,
  loadDcbPrefFromStorage,
  paintPpi,
  parseDigitalMap,
} from "@scope";
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
import { bootSession, createApp } from "./app/create-app";
import "./index.css";

const search = window.location.search;
const sessionFallback = defaultSessionSetup();
const sessionDraft = loadSessionSetup(window.localStorage, sessionFallback);
const sessionResolution = resolveSessionSetup(search, sessionFallback, sessionDraft);
const scenario = loadPlayableScenario(sessionResolution.setup.scenarioId);
const spawnSeed = parseSpawnSeed(search);
const departureQuery = parseDepartureOptions(search);
const departureOptions = {
  enabled: departureQuery.enabled && sessionResolution.setup.departuresPerHour > 0,
  ratePerHour: departureQuery.ratePerHour ?? sessionResolution.setup.departuresPerHour,
  count: departureQuery.count,
  seed: departureQuery.seed ?? sessionResolution.setup.seed,
};
const speechBoot = loadAndResolveSpeechBoot();
const handles = createApp({
  speech: speechBoot.port,
  speechPrefs: speechBoot.prefs,
  speechUrls: speechBoot.urls,
  world: createWorldForSession(
    scenario,
    sessionResolution.trafficBenchmarkCount ?? parseTrafficCount(search),
    sessionResolution.setup.seed,
    departureOptions,
    {
      initialArrivalCount: sessionResolution.setup.arrivalCount,
      arrivalsPerHour: sessionResolution.setup.arrivalsPerHour,
      seed: sessionResolution.setup.seed,
    },
  ),
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
  handles.caAlertTone.dispose();
});

const scopeView = createScopeView(scenario.arpNm.xNm, scenario.arpNm.yNm, {
  digitalMap: parseDigitalMap(scenario.maps),
  giTextLines: scenario.giTextLines,
  arp: scenario.arp,
});
const prefStore = browserDcbPrefStorage();
if (prefStore) {
  loadDcbPrefFromStorage(scopeView, scenario.icao, prefStore);
} else {
  scopeView.dcbPref.icao = scenario.icao;
}

document.title = `ATC-SIM — ${scenario.name}`;

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
  void ensureWxLevelTiles();
  void ensureWxMosaic(scopeView, { nowMs });
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
