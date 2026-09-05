/**
 * Analog: CRC/vNAS STARS TCW is a dark PPI with DCB on the glass (R07).
 * Browser ATC anti-pattern is a header banner, tutorial footer, and game HUD (R12).
 * Trainer delta: T00-01 disclaimer is first-run / F1, not a bar over the DCB.
 * Pause / 1× / 2× is a map-green corner readout (not a CRC analog).
 * DCB is a green cell grid on the PPI glass (T02-16). SSA and the
 * flight-strip list live on the PPI (T02-20), not a labeled right dock.
 * Command line overlays the bottom of the rectangular PPI.
 * Not NAS STARS.
 */

import { useEffect, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
import {
  createWorldForSession,
  defaultSessionSetup,
  loadPlayableScenario,
  loadSessionSetup,
  resolveSessionSetup,
  type Scenario,
  type SessionSetup,
} from "@scenario";
import {
  cssPointFromClient,
  handlePpiCanvasClick,
  handlePpiCanvasMiddleClick,
  handlePpiCanvasPointerHover,
  handlePpiDoubleClick,
  handlePpiPanDelta,
  isPpiSlewButton,
  isPpiSlewHeld,
  handleScopeWheel,
  installAlwaysOnScopeKeys,
  scopeFocusFromDocument,
  focusRadioCommandLine,
  clearPerTrackPtl,
  parseDigitalMap,
  applyRadarSites,
  type ScopeView,
} from "@scope";
import type { AppHandles } from "../app/create-app";
import { CommandLine, submitCommand } from "./command/command-line";
import { Disclaimer } from "./overlays/disclaimer";
import { FlightStrips, focusPpi } from "./strips/FlightStrips";
import { StripsBoard, selectTrackFromFlightStrip, terminalStripsFromWorld } from "./strips";
import { FpsDebug, isFpsDebugEnabled } from "./controls/FpsDebug";
import { ScopeCanvas } from "./canvas/ScopeCanvas";
import { ScopeHelpOverlay } from "./overlays/ScopeHelpOverlay";
import { SpeechSettingsPanel } from "./controls/settings-speech";
import { SimControls } from "./controls/sim-controls";
import { SessionSetup as SessionSetupDialog } from "./controls/session-setup";

export interface ShellProps {
  app: AppHandles;
  scenario: Scenario;
  scopeView: ScopeView;
}

export function Shell({ app, scenario, scopeView }: ShellProps) {
  const [activeScenario, setActiveScenario] = useState(scenario);
  const [setupOpen, setSetupOpen] = useState(true);
  const [setup, setSetup] = useState<SessionSetup>(() => {
    const fallback = defaultSessionSetup(scenario.id);
    const stored =
      typeof window === "undefined" ? null : loadSessionSetup(window.localStorage, fallback);
    return resolveSessionSetup(
      typeof window === "undefined" ? "" : window.location.search,
      fallback,
      stored,
    ).setup;
  });
  const [readback, setReadback] = useState("");
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [speechId, setSpeechId] = useState(app.speech.id);
  const [stripsOpen, setStripsOpen] = useState(false);
  const [, setStripsTick] = useState(0);
  const [drawerWidth, setDrawerWidth] = useState(720);
  const [isResizingDrawer, setIsResizingDrawer] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [, setScopeUiTick] = useState(0);
  const [selectionToken, setSelectionToken] = useState(0);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);

  useEffect(() => {
    if (!stripsOpen) {
      return;
    }
    const interval = setInterval(() => {
      setStripsTick((t) => t + 1);
    }, 500);
    return () => clearInterval(interval);
  }, [stripsOpen]);

  function handleResizerPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = { startX: event.clientX, startWidth: drawerWidth };
    setIsResizingDrawer(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handleResizerPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!resizeRef.current) {
      return;
    }
    const deltaX = resizeRef.current.startX - event.clientX;
    const minWidth = 360;
    const maxWidth =
      typeof window !== "undefined" ? Math.max(minWidth, window.innerWidth - 320) : 1400;
    const nextWidth = Math.min(maxWidth, Math.max(minWidth, resizeRef.current.startWidth + deltaX));
    setDrawerWidth(nextWidth);
  }

  function handleResizerPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (resizeRef.current) {
      resizeRef.current = null;
      setIsResizingDrawer(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Pointer capture release may fail if pointer was lost.
      }
    }
  }

  function refreshScopeUi(): void {
    setScopeUiTick((n) => n + 1);
  }

  useEffect(() => {
    return app.subscribeVoiceStatus((status) => {
      setVoiceStatus(status);
      if (status === null) {
        setReadback("");
      }
    });
  }, [app]);

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
  const facilityDisplay = activeScenario.icao.replace(/^K/, "");
  const facilityTitle = `${facilityDisplay} — Flight Progress Strips`;
  const { departures, arrivals } = terminalStripsFromWorld(app.world);
  const selectedAircraft = app.world.aircraft.find(
    (ac) => ac.id === app.world.selectedAircraftId,
  );
  const selectedCallsign = selectedAircraft?.callsign ?? null;

  return (
    <div
      className="scope-shell"
      data-scenario={activeScenario.id}
      data-speech={speechId}
      data-radio-fx={app.speechSettings.prefs.radioFx ? "on" : "off"}
    >
      <div className="scope-work">
        <ScopeCanvas
          scopeView={scopeView}
          world={app.world}
          onScopeChange={refreshScopeUi}
          onCanvasClick={(event) => {
            const cmdInput = document.getElementById(
              "command-line-input",
            ) as HTMLInputElement | null;
            const cmdText = cmdInput?.value;
            handlePpiCanvasClick(
              event.currentTarget,
              app.world,
              event.clientX,
              event.clientY,
              scopeView,
              cmdText,
            );
            if (
              cmdText === "UN" ||
              cmdText === "**" ||
              cmdText?.trim().toUpperCase() === "UN" ||
              cmdText?.trim() === "**"
            ) {
              if (cmdInput) {
                cmdInput.value = "";
              }
            }
            setSelectionToken((t) => t + 1);
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
            if (event.button === 1) {
              // Middle click: toggle Cyan highlight
              event.preventDefault();
              handlePpiCanvasMiddleClick(
                event.currentTarget,
                app.world,
                event.clientX,
                event.clientY,
                scopeView,
              );
              refreshScopeUi();
              return;
            }
            if (!isPpiSlewButton(event.button)) {
              return;
            }
            event.preventDefault();
            panRef.current = { lastX: event.clientX, lastY: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onCanvasPointerMove={(event: PointerEvent<HTMLCanvasElement>) => {
            if (!panRef.current || !isPpiSlewHeld(event.buttons)) {
              handlePpiCanvasPointerHover(
                event.currentTarget,
                app.world,
                event.clientX,
                event.clientY,
                scopeView,
              );
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
          footer={
            <CommandLine
              readback={readback}
              voiceStatus={voiceStatus}
              selectedCallsign={selectedCallsign}
              selectionToken={selectionToken}
              onPttPress={() => app.ptt.pressFromPointer()}
              onPttRelease={() => app.ptt.releaseFromPointer()}
              onSubmit={(input) => {
                setVoiceStatus(null);
                void submitCommand(app.world, input, app.log, {
                  pathC: app.speechSettings.pathCActive,
                }).then((result) => {
                  setReadback(result.readback);
                  if (result.accepted) {
                    void app.voiceLoop.playReadback(result.readback, result.command?.callsign);
                  }
                });
              }}
            />
          }
        >
          {fpsDebug ? <FpsDebug /> : null}
          <SimControls world={app.world} />
          <SpeechSettingsPanel
            controller={app.speechSettings}
            speechId={speechId}
            onChange={() => setSpeechId(app.speech.id)}
          />
          <Disclaimer />
          <ScopeHelpOverlay open={scopeView.helpOpen} />
          <FlightStrips
            world={app.world}
            tracks={scopeView.tracks}
            onSelectionChange={() => {
              setSelectionToken((t) => t + 1);
              refreshScopeUi();
            }}
            listFontPx={scopeView.charSizes.lists}
            listBrite={scopeView.brite.lst}
          />
          <div className="strips-toggle-bar">
            <button
              type="button"
              className={`strips-toggle-button ${stripsOpen ? "open" : ""}`}
              data-testid="strips-toggle-btn"
              onClick={() => setStripsOpen((open) => !open)}
              title={
                stripsOpen
                  ? "Collapse flight progress strips drawer"
                  : "Expand flight progress strips drawer"
              }
            >
              Strips
            </button>
          </div>
        </ScopeCanvas>
        <aside
          className={`strips-drawer ${stripsOpen ? "open" : "collapsed"} ${isResizingDrawer ? "resizing" : ""}`}
          data-testid="strips-drawer"
          role="region"
          aria-label="Flight progress strips drawer"
          aria-hidden={!stripsOpen}
          style={
            stripsOpen ? { width: `${drawerWidth}px`, flexBasis: `${drawerWidth}px` } : undefined
          }
        >
          {stripsOpen ? (
            <div
              className="strips-drawer-resizer"
              data-testid="strips-drawer-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize flight progress strips drawer"
              onPointerDown={handleResizerPointerDown}
              onPointerMove={handleResizerPointerMove}
              onPointerUp={handleResizerPointerUp}
              onPointerCancel={handleResizerPointerUp}
            />
          ) : null}
          <div className="strips-drawer-content" data-testid="strips-drawer-content">
            <StripsBoard
              departures={departures}
              arrivals={arrivals}
              facilityTitle={facilityTitle}
              selectedStripId={app.world.selectedAircraftId ?? undefined}
              onSelectStrip={(strip) => {
                selectTrackFromFlightStrip(app.world, strip);
                setSelectionToken((t) => t + 1);
                refreshScopeUi();
              }}
            />
          </div>
        </aside>
      </div>
      <SessionSetupDialog
        open={setupOpen}
        initial={setup}
        onCancel={() => setSetupOpen(false)}
        onApply={(next) => {
          const nextScenario = loadPlayableScenario(next.scenarioId);
          app.replaceWorld(
            createWorldForSession(
              nextScenario,
              null,
              next.seed,
              {
                enabled: next.departuresPerHour > 0,
                ratePerHour: next.departuresPerHour,
                seed: next.seed,
              },
              {
                initialArrivalCount: next.arrivalCount,
                arrivalsPerHour: next.arrivalsPerHour,
                seed: next.seed,
              },
            ),
          );
          scopeView.tracks.clear();
          clearPerTrackPtl(scopeView);
          scopeView.giTextLines = nextScenario.giTextLines;
          scopeView.digitalMap = parseDigitalMap(nextScenario.maps);
          // Session apply uses the same generic site bind as boot (T02-77).
          // CRC R07 SITE analog; R05 FOA display data; R01 radar-identification
          // wording. Unknown stored SITE id → FUSED. Trainer fixtures; not live
          // sensors. No airport-id branch.
          applyRadarSites(scopeView, nextScenario.radarSites);
          if (typeof document !== "undefined") {
            document.title = `ATC-SIM — ${nextScenario.name}`;
          }
          setSetup(next);
          setActiveScenario(nextScenario);
          setSetupOpen(false);
          refreshScopeUi();
        }}
      />
    </div>
  );
}
