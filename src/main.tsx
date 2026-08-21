import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createWorldFromScenario, loadKdem } from "@scenario";
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
