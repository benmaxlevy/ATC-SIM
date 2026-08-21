import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NullSpeechPort } from "@speech";
import { App } from "./App";
import { createApp } from "./app/create-app";
import "./index.css";

const handles = createApp({ speech: new NullSpeechPort() });

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

void handles;
