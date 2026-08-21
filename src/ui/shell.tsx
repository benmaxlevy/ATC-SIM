import { useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import type { Scenario } from "@scenario";
import {
  PpiPlaceholder,
  cssPointFromClient,
  handlePpiCanvasClick,
  handlePpiDoubleClick,
  handlePpiPanDelta,
  handleScopeWheel,
  type ScopeView,
} from "@scope";
import type { AppHandles } from "../app/create-app";
import { CommandLine, focusCommandLine } from "./command-line";
import { Disclaimer } from "./disclaimer";
import { SimControls } from "./sim-controls";
import { submitCommand } from "./submitCommand";

export interface ShellProps {
  app: AppHandles;
  scenario: Scenario;
  scopeView: ScopeView;
}

export function Shell({ app, scenario, scopeView }: ShellProps) {
  const [readback, setReadback] = useState("");
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);

  return (
    <div className="scope-shell" data-scenario={scenario.id} data-speech={app.speech.id}>
      <Disclaimer />
      <PpiPlaceholder
        onCanvasClick={(event) => {
          handlePpiCanvasClick(
            event.currentTarget,
            app.world,
            event.clientX,
            event.clientY,
            scopeView,
          );
          focusCommandLine();
        }}
        onCanvasDoubleClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const { x, y } = cssPointFromClient(event.clientX, event.clientY, rect);
          handlePpiDoubleClick(scopeView, app.world, x, y, rect.width, rect.height);
        }}
        onCanvasWheel={(event: WheelEvent<HTMLCanvasElement>) => {
          handleScopeWheel(event, scopeView);
        }}
        onCanvasPointerDown={(event: PointerEvent<HTMLCanvasElement>) => {
          if (event.button !== 1) {
            return;
          }
          event.preventDefault();
          panRef.current = { lastX: event.clientX, lastY: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onCanvasPointerMove={(event: PointerEvent<HTMLCanvasElement>) => {
          if (!panRef.current || (event.buttons & 4) === 0) {
            return;
          }
          const rect = event.currentTarget.getBoundingClientRect();
          handlePpiPanDelta(
            scopeView,
            event.clientX - panRef.current.lastX,
            event.clientY - panRef.current.lastY,
            rect.width,
            rect.height,
          );
          panRef.current = { lastX: event.clientX, lastY: event.clientY };
        }}
        onCanvasPointerUp={() => {
          panRef.current = null;
        }}
        onCanvasContextMenu={(event) => event.preventDefault()}
      />
      <SimControls world={app.world} />
      <CommandLine
        readback={readback}
        onSubmit={(input) => {
          const result = submitCommand(app.world, input, app.log);
          setReadback(result.readback);
        }}
      />
    </div>
  );
}
