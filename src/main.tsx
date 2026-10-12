import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { advanceWorld, createAccumulator, flightPlanForAircraft } from "@core";
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
  advanceFmaSurveillanceView,
  browserDcbPrefStorage,
  createScopeView,
  bindFmaScenarioFlow,
  clearFmaSurveillanceView,
  fmaReportsForSimulationTick,
  ensureWxMosaic,
  hasActiveUninhibitedConflict,
  hasActiveUninhibitedMsaw,
  loadDcbPrefFromStorage,
  loadScopeFonts,
  paintPpi,
  parseDigitalMap,
  pruneFmaSurveillanceView,
  startMetarPolling,
  observeFmaAlertRuntime,
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
} from "@ui";
import { bootSession, createApp } from "./app/create-app";
import { syncFmaSpeech } from "./app/fma-speech";
import "./index.css";
import "./scope/starsFonts.css";

const search = window.location.search;
const requestedScenario = new URLSearchParams(search).get("scenario")?.trim().toLowerCase();
const sessionFallback = defaultSessionSetup(requestedScenario || undefined);
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
    {
      traffic: sessionResolution.setup.vfrTraffic,
      requests: sessionResolution.setup.vfrRequests,
    },
  ),
});
bootSession(handles, scenario, Date.now(), spawnSeed);
window.addEventListener("pagehide", () => {
  clearFmaSurveillanceView(scopeView);
  handles.voiceLoop.dispose();
  try {
    handles.speech.dispose?.();
  } catch {
    // Teardown must never throw.
  }
  handles.ptt.dispose();
  handles.caAlertTone.dispose();
  handles.eventSounds.dispose();
  handles.fmaSpeech.dispose();
  stopMetarPolling();
});

// T02-77: authored radarSites ride the same generic scenario bind as MAPS /
// GI TEXT. Empty catalog stays implicit FUSED. CRC R07 SITE analog; R05 FOA
// display data; R01 radar-identification wording. Trainer fixtures, not live
// sensors. No airport-id branch.
// T02-80: live AviationWeather METAR polling for scenario.ssaWeatherAirports.
const scopeView = createScopeView(scenario.arpNm.xNm, scenario.arpNm.yNm, {
  digitalMap: parseDigitalMap(scenario.maps),
  giTextLines: scenario.giTextLines,
  radarSites: scenario.radarSites,
  radarTilesetBoundaryNm: scenario.radarTilesetBoundaryNm,
  arp: scenario.arp,
  ssaWeatherAirports: scenario.ssaWeatherAirports,
  towerAirports: scenario.towerAirports ?? scenario.ssaWeatherAirports,
});
bindFmaScenarioFlow(scopeView, scenario);
const stopMetarPolling = startMetarPolling(scopeView, {
  primaryIcao: scenario.icao,
  giSlot: scenario.ssaWeatherGiSlot,
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

const acc = createAccumulator();
let lastFrameMs = 0;
let lastFmaSimMs: number | null = null;
let observedFmaWorld = handles.world;
const fpsDebugOn = isFpsDebugEnabled(window.location.search);

function paintCurrentPpi(): void {
  const canvas = document.getElementById(PpiPlaceholderId);
  if (canvas instanceof HTMLCanvasElement) {
    paintPpi(canvas, handles.world, scopeView);
  }
  syncDisplayControlBar(scopeView, handles.world);
}

function onFrame(nowMs: number): void {
  const wallDtS = lastFrameMs === 0 ? 0 : Math.max(0, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;
  // Physics: wall Δt feeds the accumulator. Never pass this dt into stepWorld.
  advanceWorld(handles.world, wallDtS, acc);
  if (observedFmaWorld !== handles.world) {
    clearFmaSurveillanceView(scopeView);
    observedFmaWorld = handles.world;
    lastFmaSimMs = null;
  }
  handles.caAlertTone.setVolume(scopeView.vol ?? 2);
  handles.afterPhysicsTick(
    hasActiveUninhibitedConflict(handles.world, scopeView),
    hasActiveUninhibitedMsaw(handles.world, scopeView),
  );
  void ensureWxMosaic(scopeView, { nowMs });
  paintCurrentPpi();
  // FMA aging runs as a simulation observer after the sampler has published
  // this frame's reports. Paint-only/paused frames can prune lifecycle state,
  // but only an advanced sim clock evaluates loss or coast thresholds.
  const liveTrackIds = new Set(handles.world.aircraft.map((aircraft) => aircraft.id));
  const associatedTrackIds = new Set(
    handles.world.aircraft
      .filter((aircraft) => flightPlanForAircraft(handles.world, aircraft.id) != null)
      .map((aircraft) => aircraft.id),
  );
  pruneFmaSurveillanceView(scopeView, liveTrackIds, associatedTrackIds);
  if (lastFmaSimMs === null || handles.world.simTimeMs > lastFmaSimMs) {
    const fmaReports = fmaReportsForSimulationTick(
      scopeView,
      [...scopeView.tracks.values()].flatMap((td) => (td.lastReport ? [td.lastReport] : [])),
    );
    advanceFmaSurveillanceView(scopeView, {
      nowSimMs: handles.world.simTimeMs,
      reports: fmaReports,
      liveTrackIds,
      associatedTrackIds,
    });
    lastFmaSimMs = handles.world.simTimeMs;
  }
  // Alert lifecycle pruning is clock-independent: pause must not preserve a
  // deleted/disassociated track's episodes for a later re-association.
  observeFmaAlertRuntime(
    scopeView,
    handles.world,
    handles.world.simTimeMs,
    fmaReportsForSimulationTick(
      scopeView,
      [...scopeView.tracks.values()].flatMap((td) => (td.lastReport ? [td.lastReport] : [])),
    ),
  );
  syncFmaSpeech(handles.fmaSpeech, scopeView, handles.world);
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

void loadScopeFonts().then(() => {
  createRoot(root).render(
    <StrictMode>
      <Shell app={handles} scenario={scenario} scopeView={scopeView} />
    </StrictMode>,
  );

  requestAnimationFrame(onFrame);
});

window.addEventListener("resize", paintCurrentPpi);
