import type { Scenario } from "@scenario";
import {
  applyRadarSites,
  applyRadarTilesetBoundary,
  bindFmaScenarioFlow,
  defaultSelectedMapGroupId,
  initialMapVisibility,
  loadDcbPrefFromStorage,
  parseDigitalMap,
  type DcbPrefStorage,
  type ScopeView,
} from "@scope";

/** Bind facility display data before loading preferences that validate against it. */
export function bindScenarioDisplayContext(
  view: ScopeView,
  scenario: Scenario,
  storage?: DcbPrefStorage | null,
): void {
  const digitalMap = parseDigitalMap(scenario.maps);
  view.digitalMap = digitalMap;
  view.arp = scenario.arp;
  view.airportEastNm = scenario.arpNm.xNm;
  view.airportNorthNm = scenario.arpNm.yNm;
  view.mapVisibility = initialMapVisibility(
    digitalMap.loadedVideoMaps,
    view.showRunway,
    view.showLocalizer,
    view.showCoastline,
  );
  view.selectedMapGroupId = defaultSelectedMapGroupId(digitalMap.videoMapGroups);
  view.mapCache = null;
  view.giTextLines = scenario.giTextLines;
  applyRadarSites(view, scenario.radarSites ?? []);
  applyRadarTilesetBoundary(view, scenario.radarTilesetBoundaryNm);

  loadDcbPrefFromStorage(
    view,
    scenario.icao,
    storage ?? { getItem: () => null, setItem: () => undefined },
  );

  bindFmaScenarioFlow(view, scenario);
}
