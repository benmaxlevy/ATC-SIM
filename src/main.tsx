import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { advanceWorld, createAccumulator } from "@core";
import { createWorldFromScenario, loadKdem } from "@scenario";
import { PpiPlaceholderId, paintPpi } from "@scope";
import { NullSpeechPort } from "@speech";
import { Shell } from "@ui";
import { bootSession } from "./app/boot-session";
import { createApp } from "./app/create-app";
import "./index.css";

const kdem = loadKdem();
const handles = createApp({
  speech: new NullSpeechPort(),
  world: createWorldFromScenario(kdem),
});
bootSession(handles, kdem, Date.now());

document.title = "ATC-SIM — KDEM";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <Shell app={handles} scenario={kdem} />
  </StrictMode>,
);

const acc = createAccumulator();
let lastFrameMs = 0;

function onFrame(nowMs: number): void {
  const wallDtS = lastFrameMs === 0 ? 0 : Math.max(0, (nowMs - lastFrameMs) / 1000);
  lastFrameMs = nowMs;
  // Physics: wall Δt feeds the accumulator. Never pass this dt into stepWorld.
  advanceWorld(handles.world, wallDtS, acc);
  const canvas = document.getElementById(PpiPlaceholderId);
  if (canvas instanceof HTMLCanvasElement) {
    paintPpi(canvas, handles.world);
  }
  requestAnimationFrame(onFrame);
}

requestAnimationFrame(onFrame);
