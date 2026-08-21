import { useEffect, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import type { Scenario } from "@scenario";
import {
  cssPointFromClient,
  handlePpiCanvasClick,
  handlePpiDoubleClick,
  handlePpiPanDelta,
  handleScopeWheel,
  DROP_TRACK_HELP,
  INITIATE_TRACK_HELP,
  installAlwaysOnScopeKeys,
  scopeFocusFromDocument,
  focusRadioCommandLine,
  type ScopeView,
} from "@scope";
import type { AppHandles } from "../app/create-app";
import { CommandLine } from "./command-line";
import { Disclaimer } from "./disclaimer";
import { FlightStrips, focusPpi } from "./FlightStrips";
import { FpsDebug } from "./FpsDebug";
import { isFpsDebugEnabled } from "./fpsHud";
import { ScopeCanvas } from "./ScopeCanvas";
import { ScopeHelpOverlay } from "./ScopeHelpOverlay";
import { SimControls } from "./sim-controls";
import { submitCommand } from "./submitCommand";

export interface ShellProps {
  app: AppHandles;
  scenario: Scenario;
  scopeView: ScopeView;
}

export function Shell({ app, scenario, scopeView }: ShellProps) {
  const [readback, setReadback] = useState("");
  const [stripsCollapsed, setStripsCollapsed] = useState(false);
  const [, setScopeUiTick] = useState(0);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);

  function refreshScopeUi(): void {
    setScopeUiTick((n) => n + 1);
  }

  useEffect(() => {
    return installAlwaysOnScopeKeys(scopeView, app.world, {
      onHandled: () => setScopeUiTick((n) => n + 1),
      focusRadio: focusRadioCommandLine,
      cycleFocus() {
        if (scopeFocusFromDocument(document) === "scope") {
          focusRadioCommandLine();
        } else {
          focusPpi();
        }
      },
    });
  }, [scopeView, app.world]);

  const fpsDebug = typeof window !== "undefined" && isFpsDebugEnabled(window.location.search);

  return (
    <div className="scope-shell" data-scenario={scenario.id} data-speech={app.speech.id}>
      <Disclaimer />
      <div className="scope-work">
        <ScopeCanvas
          scopeView={scopeView}
          onScopeChange={refreshScopeUi}
          onCanvasClick={(event) => {
            handlePpiCanvasClick(
              event.currentTarget,
              app.world,
              event.clientX,
              event.clientY,
              scopeView,
            );
            refreshScopeUi();
            event.currentTarget.focus();
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
        >
          {fpsDebug ? <FpsDebug /> : null}
          <ScopeHelpOverlay open={scopeView.helpOpen} />
        </ScopeCanvas>
        <FlightStrips
          world={app.world}
          tracks={scopeView.tracks}
          collapsed={stripsCollapsed}
          onToggleCollapsed={() => setStripsCollapsed((wasCollapsed) => !wasCollapsed)}
          onSelectionChange={refreshScopeUi}
        />
      </div>
      <SimControls world={app.world} />
      <p className="ownership-help">
        {INITIATE_TRACK_HELP} {DROP_TRACK_HELP}
      </p>
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
