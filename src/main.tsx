import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { advanceWorld, createAccumulator } from "@core";
import { createWorldForSession, loadKdem, parseTrafficCount } from "@scenario";
import { PpiPlaceholderId, createScopeView, paintPpi, parseDigitalMap } from "@scope";
import { NullSpeechPort } from "@speech";
import {
  FPS_DEBUG_ID,
  SIM_HUD_ID,
  Shell,
  formatFpsDebug,
  formatSimHud,
  isFpsDebugEnabled,
  syncDisplayControlBar,
  syncStripCallsignColors,
} from "@ui";
import { bootSession } from "./app/boot-session";
import { createApp } from "./app/create-app";
import "./index.css";

const kdem = loadKdem();
const handles = createApp({
  speech: new NullSpeechPort(),
  world: createWorldForSession(kdem, parseTrafficCount(window.location.search)),
});
bootSession(handles, kdem, Date.now());

const scopeView = createScopeView(kdem.arpNm.xNm, kdem.arpNm.yNm, {
  digitalMap: parseDigitalMap(kdem.maps),
});

document.title = "ATC-SIM — KDEM";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <Shell app={handles} scenario={kdem} scopeView={scopeView} />
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
  syncDisplayControlBar(scopeView);
}

function onFrame(nowMs: number): void {
  const wallDtS = lastFrameMs === 0 ? 0 : Math.max(0, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;
  // Physics: wall Δt feeds the accumulator. Never pass this dt into stepWorld.
  advanceWorld(handles.world, wallDtS, acc);
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
