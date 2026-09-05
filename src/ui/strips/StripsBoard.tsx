import * as React from "react";
import { useRef, useState } from "react";
import type { World } from "@core";
import { setSelectedAircraft } from "@core";
import { ArrivalStrip } from "./ArrivalStrip";
import { DepartureStrip } from "./DepartureStrip";
import { StripSeparator } from "./StripSeparator";
import { StripsContextMenu } from "./StripsContextMenu";
import type {
  ArrivalStripData,
  DepartureStripData,
  FlightStrip,
  RackStripItem,
  StripAnnotationBoxes,
  StripSeparator as StripSeparatorModel,
} from "./types";
import { isStripSeparator } from "./types";
import "./strips.css";

/**
 * Merges user-entered annotation boxes into a strip object, preserving base values
 * when user annotations have not modified them.
 */
export function mergeStripAnnotations<T extends FlightStrip>(
  strip: T,
  userBoxes?: StripAnnotationBoxes,
): T {
  if (!userBoxes) return strip;
  const baseBoxes = strip.annotationBoxes;

  let mergedBoxes10to18: string[] | undefined = undefined;
  if (userBoxes.boxes10to18 !== undefined || baseBoxes?.boxes10to18 !== undefined) {
    mergedBoxes10to18 = Array(9).fill("");
    for (let i = 0; i < 9; i++) {
      const userVal = userBoxes.boxes10to18?.[i];
      const baseVal = baseBoxes?.boxes10to18?.[i] ?? "";
      mergedBoxes10to18[i] = userVal !== undefined ? userVal : baseVal;
    }
  }

  const merged: StripAnnotationBoxes = {
    ...baseBoxes,
    ...userBoxes,
    box8A: userBoxes.box8A !== undefined ? userBoxes.box8A : baseBoxes?.box8A,
    box8B: userBoxes.box8B !== undefined ? userBoxes.box8B : baseBoxes?.box8B,
    boxes10to18: mergedBoxes10to18 ?? baseBoxes?.boxes10to18,
  };

  return {
    ...strip,
    annotationBoxes: merged,
  };
}

export const DEFAULT_FACILITY_TITLE = "ATL — Flight Progress Strips";

export interface DraggedStripState {
  id: string;
  section: "departures" | "arrivals";
  sourceIndex: number;
}

export interface DropIndicatorState {
  section: "departures" | "arrivals";
  targetIndex: number;
}

/**
 * Selects an aircraft in World when it matches the given strip's callsign (ACID) or id.
 * Shared selection state with PPI and flight strips list.
 *
 * @returns true if an aircraft was matched and selected, false otherwise.
 */
export function selectTrackFromFlightStrip(world: World, strip: FlightStrip): boolean {
  const normAcid = strip.acid ? strip.acid.trim().toUpperCase() : "";
  const normId = strip.id ? strip.id.trim().toUpperCase() : "";
  const match = world.aircraft.find((ac) => {
    const acId = ac.id ? ac.id.trim().toUpperCase() : "";
    const acCallsign = ac.callsign ? ac.callsign.trim().toUpperCase() : "";
    return (
      (acId !== "" && (acId === normId || acId === normAcid)) ||
      (acCallsign !== "" && (acCallsign === normAcid || acCallsign === normId))
    );
  });
  if (match) {
    setSelectedAircraft(world, match.id);
    return true;
  }
  return false;
}

/**
 * Creates an onSelectStrip callback that synchronizes the clicked strip to World.selectedAircraftId.
 */
export function createStripSelectionHandler(
  world: World,
  onSelect?: (strip: FlightStrip) => void,
): (strip: FlightStrip) => void {
  return (strip: FlightStrip) => {
    selectTrackFromFlightStrip(world, strip);
    onSelect?.(strip);
  };
}

export interface StripsBoardProps {
  /** Array of departure flight strips (defaults to empty array). */
  departures?: DepartureStripData[];
  /** Array of arrival flight strips (defaults to empty array). */
  arrivals?: ArrivalStripData[];
  /** Facility header title (defaults to ATL — Flight Progress Strips). */
  facilityTitle?: string;
  /** Selection callback fired when a strip is clicked or activated. */
  onSelectStrip?: (strip: FlightStrip) => void;
  /** Optional ID or ACID of currently selected strip. */
  selectedStripId?: string;
  /** Optional custom CSS class name for outer container. */
  className?: string;
  /** Layout orientation mode ("horizontal" | "vertical"). Defaults to "horizontal". */
  layoutMode?: "horizontal" | "vertical";
  /** Initial layout mode when uncontrolled (defaults to "horizontal"). */
  defaultLayout?: "horizontal" | "vertical";
  /** Collapsed state for departures rack. */
  departuresCollapsed?: boolean;
  /** Initial collapsed state for departures rack when uncontrolled (defaults to false). */
  defaultDeparturesCollapsed?: boolean;
  /** Collapsed state for arrivals rack. */
  arrivalsCollapsed?: boolean;
  /** Initial collapsed state for arrivals rack when uncontrolled (defaults to false). */
  defaultArrivalsCollapsed?: boolean;
  /** Callback fired when layout mode changes. */
  onLayoutModeChange?: (mode: "horizontal" | "vertical") => void;
  /** Callback fired when departures collapsed state changes. */
  onDeparturesCollapsedChange?: (collapsed: boolean) => void;
  /** Callback fired when arrivals collapsed state changes. */
  onArrivalsCollapsedChange?: (collapsed: boolean) => void;
  /** Set of strip IDs that are indented (controlled mode). */
  indentedStripIds?: Set<string>;
  /** Initial set of indented strip IDs when uncontrolled. */
  defaultIndentedStripIds?: Set<string>;
  /** Callback fired when a strip's indentation state changes. */
  onToggleIndent?: (stripId: string, indented: boolean) => void;
  /** Controlled ordered strip IDs for departures. */
  departureOrder?: string[];
  /** Initial ordered strip IDs for departures when uncontrolled. */
  defaultDepartureOrder?: string[];
  /** Controlled ordered strip IDs for arrivals. */
  arrivalOrder?: string[];
  /** Initial ordered strip IDs for arrivals when uncontrolled. */
  defaultArrivalOrder?: string[];
  /** Callback fired when strips within a rack section are reordered. */
  onReorderStrips?: (section: "departures" | "arrivals", orderedStrips: FlightStrip[]) => void;
  /** Callback fired when any rack items (strips or separators) within a section are reordered. */
  onReorderRack?: (section: "departures" | "arrivals", orderedItems: RackStripItem[]) => void;
  /** Controlled separators list. */
  separators?: StripSeparatorModel[];
  /** Initial separators list when uncontrolled. */
  defaultSeparators?: StripSeparatorModel[];
  /** Callback fired when separators collection changes (add, delete, edit). */
  onSeparatorsChange?: (separators: StripSeparatorModel[]) => void;
  /** Controlled active editing separator ID. */
  editingSeparatorId?: string | null;
  /** Initial active editing separator ID when uncontrolled. */
  defaultEditingSeparatorId?: string | null;
  /** Callback fired when active editing separator ID changes. */
  onEditingSeparatorChange?: (id: string | null) => void;
  /** Controlled dragged strip state. */
  draggedStrip?: DraggedStripState | null;
  /** Initial dragged strip state when uncontrolled. */
  defaultDraggedStrip?: DraggedStripState | null;
  /** Controlled drop indicator state. */
  dropIndicator?: DropIndicatorState | null;
  /** Initial drop indicator state when uncontrolled. */
  defaultDropIndicator?: DropIndicatorState | null;
  /** Controlled annotations map keyed by strip ID. */
  annotations?: Record<string, StripAnnotationBoxes>;
  /** Initial annotations map when uncontrolled. */
  defaultAnnotations?: Record<string, StripAnnotationBoxes>;
  /** Callback fired when a strip annotation box is updated. */
  onUpdateAnnotation?: (stripId: string, boxKey: string, value: string) => void;
}

function useSafeState<T>(initialValue: T | (() => T)): [T, (action: T | ((prev: T) => T)) => void] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatcher = (React as any)?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
    ?.ReactCurrentDispatcher?.current;
  if (!dispatcher) {
    const val = typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
    return [val, () => {}];
  }
  return useState(initialValue);
}

function useSafeRef<T>(initialValue: T): { current: T } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatcher = (React as any)?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
    ?.ReactCurrentDispatcher?.current;
  if (!dispatcher) {
    return { current: initialValue };
  }
  return useRef(initialValue);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) {
    if (!b.has(item)) return false;
  }
  return true;
}

export function reconcileOrder(
  strips: FlightStrip[],
  currentOrder: string[],
  validExtraIds?: Set<string>,
): string[] {
  if ((!strips || strips.length === 0) && (!validExtraIds || validExtraIds.size === 0)) return [];
  const stripMap = new Map(strips.map((s) => [s.id, s]));
  const reconciled: string[] = [];
  // 1. Keep IDs from currentOrder that still exist in incoming strips or are valid extra IDs (separators)
  for (const id of currentOrder) {
    if (stripMap.has(id)) {
      reconciled.push(id);
      stripMap.delete(id);
    } else if (validExtraIds?.has(id)) {
      reconciled.push(id);
    }
  }
  // 2. Append any newly added strip IDs that were not in currentOrder
  for (const strip of strips) {
    if (stripMap.has(strip.id)) {
      reconciled.push(strip.id);
      stripMap.delete(strip.id);
    }
  }
  // 3. Append any extra valid IDs (e.g. newly created separators) not yet in currentOrder
  if (validExtraIds) {
    const inReconciled = new Set(reconciled);
    for (const extraId of validExtraIds) {
      if (!inReconciled.has(extraId)) {
        reconciled.push(extraId);
      }
    }
  }
  return reconciled;
}

function applyRackOrder<T extends FlightStrip>(
  strips: T[],
  separators: StripSeparatorModel[],
  section: "departures" | "arrivals",
  order: string[],
): RackStripItem[] {
  const stripMap = new Map(strips.map((s) => [s.id, s]));
  const sepMap = new Map(separators.filter((s) => s.section === section).map((s) => [s.id, s]));
  const ordered: RackStripItem[] = [];
  if (order && order.length > 0) {
    for (const id of order) {
      const strip = stripMap.get(id);
      if (strip) {
        ordered.push(strip);
        stripMap.delete(id);
        continue;
      }
      const sep = sepMap.get(id);
      if (sep) {
        ordered.push(sep);
        sepMap.delete(id);
      }
    }
  }
  for (const strip of stripMap.values()) {
    ordered.push(strip);
  }
  for (const sep of sepMap.values()) {
    ordered.push(sep);
  }
  return ordered;
}

/**
 * StripsBoard: Terminal flight progress strips board with dark controller cab backdrop,
 * facility title header, layout orientation toggle, and collapsible rack columns
 * (Departures and Arrivals).
 */
export function StripsBoard({
  departures = [],
  arrivals = [],
  facilityTitle: _facilityTitle = DEFAULT_FACILITY_TITLE,
  onSelectStrip,
  selectedStripId,
  className,
  layoutMode: layoutModeProp,
  defaultLayout,
  departuresCollapsed: departuresCollapsedProp,
  defaultDeparturesCollapsed,
  arrivalsCollapsed: arrivalsCollapsedProp,
  defaultArrivalsCollapsed,
  indentedStripIds: indentedStripIdsProp,
  defaultIndentedStripIds,
  departureOrder: departureOrderProp,
  defaultDepartureOrder,
  arrivalOrder: arrivalOrderProp,
  defaultArrivalOrder,
  onReorderStrips,
  onReorderRack,
  separators: separatorsProp,
  defaultSeparators,
  onSeparatorsChange,
  editingSeparatorId: editingSeparatorIdProp,
  defaultEditingSeparatorId,
  onEditingSeparatorChange,
  draggedStrip: draggedStripProp,
  defaultDraggedStrip,
  dropIndicator: dropIndicatorProp,
  defaultDropIndicator,
  annotations: annotationsProp,
  defaultAnnotations,
  onUpdateAnnotation,
  onLayoutModeChange,
  onDeparturesCollapsedChange,
  onArrivalsCollapsedChange,
  onToggleIndent,
}: StripsBoardProps) {
  const seenStripIdsRef = useSafeRef<Set<string>>(new Set());

  const [internalAnnotations, setInternalAnnotations] = useSafeState<
    Record<string, StripAnnotationBoxes>
  >(defaultAnnotations ?? {});

  const annotationsRef = useSafeRef<Record<string, StripAnnotationBoxes>>(defaultAnnotations ?? {});

  const annotations = annotationsProp ?? annotationsRef.current ?? internalAnnotations;

  const handleUpdateAnnotation = (stripId: string, boxKey: string, value: string) => {
    const normKey = boxKey.toUpperCase();
    const currentMap = annotationsProp ?? annotationsRef.current ?? internalAnnotations;
    const existing = currentMap[stripId] ?? {};
    const currentStrip = [...departures, ...arrivals].find((s) => s.id === stripId);
    const baseBoxes = currentStrip?.annotationBoxes;

    const currentBoxes10to18 = existing.boxes10to18
      ? [...existing.boxes10to18]
      : baseBoxes?.boxes10to18
        ? [...baseBoxes.boxes10to18]
        : Array(9).fill("");

    while (currentBoxes10to18.length < 9) {
      currentBoxes10to18.push("");
    }

    const updated: StripAnnotationBoxes = {
      ...baseBoxes,
      ...existing,
      box8A: existing.box8A !== undefined ? existing.box8A : baseBoxes?.box8A,
      box8B: existing.box8B !== undefined ? existing.box8B : baseBoxes?.box8B,
      boxes10to18: [...currentBoxes10to18],
    };

    if (normKey === "8A" || normKey === "BOX8A") {
      updated.box8A = value;
    } else if (normKey === "8B" || normKey === "BOX8B") {
      updated.box8B = value;
    } else {
      const boxNum = parseInt(boxKey, 10);
      if (!isNaN(boxNum) && boxNum >= 10 && boxNum <= 18) {
        const idx = boxNum - 10;
        updated.boxes10to18![idx] = value;
      }
    }

    const nextAnnotations = {
      ...currentMap,
      [stripId]: updated,
    };

    annotationsRef.current = nextAnnotations;
    if (annotationsProp === undefined) {
      setInternalAnnotations(nextAnnotations);
    }
    onUpdateAnnotation?.(stripId, boxKey, value);
  };

  const [internalSeparators, setInternalSeparators] = useSafeState<StripSeparatorModel[]>(
    defaultSeparators ?? [],
  );
  const separators = separatorsProp ?? internalSeparators;

  const setSeparators = (
    next: StripSeparatorModel[] | ((prev: StripSeparatorModel[]) => StripSeparatorModel[]),
  ) => {
    const resolved = typeof next === "function" ? next(separators) : next;
    if (separatorsProp === undefined) {
      setInternalSeparators(resolved);
    }
    onSeparatorsChange?.(resolved);
  };

  const [internalEditingId, setInternalEditingId] = useSafeState<string | null>(
    defaultEditingSeparatorId ?? null,
  );
  const editingSeparatorId = editingSeparatorIdProp ?? internalEditingId;

  const setEditingSeparatorId = (next: string | null) => {
    if (editingSeparatorIdProp === undefined) {
      setInternalEditingId(next);
    }
    onEditingSeparatorChange?.(next);
  };

  const [contextMenu, setContextMenu] = useSafeState<{
    visible: boolean;
    x: number;
    y: number;
    section: "departures" | "arrivals";
    type: "empty-space" | "separator";
    separatorId?: string;
  } | null>(null);

  const [internalDepOrder, setInternalDepOrder] = useSafeState<string[]>(
    () => defaultDepartureOrder ?? departures.map((d) => d.id),
  );
  const [internalArrOrder, setInternalArrOrder] = useSafeState<string[]>(
    () => defaultArrivalOrder ?? arrivals.map((a) => a.id),
  );

  const [internalDraggedStrip, setInternalDraggedStrip] = useSafeState<DraggedStripState | null>(
    defaultDraggedStrip ?? null,
  );
  const [internalDropIndicator, setInternalDropIndicator] = useSafeState<DropIndicatorState | null>(
    defaultDropIndicator ?? null,
  );

  const dragRef = useSafeRef<{
    draggedStrip: DraggedStripState | null;
    dropIndicator: DropIndicatorState | null;
    departureOrder: string[] | null;
    arrivalOrder: string[] | null;
  }>({
    draggedStrip: defaultDraggedStrip ?? null,
    dropIndicator: defaultDropIndicator ?? null,
    departureOrder: defaultDepartureOrder ?? null,
    arrivalOrder: defaultArrivalOrder ?? null,
  });

  const depSeparatorIds = new Set(
    separators.filter((s) => s.section === "departures").map((s) => s.id),
  );
  const arrSeparatorIds = new Set(
    separators.filter((s) => s.section === "arrivals").map((s) => s.id),
  );

  const departuresWithAnnotations = departures.map((d) =>
    mergeStripAnnotations(d, annotations[d.id]),
  );
  const arrivalsWithAnnotations = arrivals.map((a) => mergeStripAnnotations(a, annotations[a.id]));

  const rawDepOrder = departureOrderProp ?? dragRef.current.departureOrder ?? internalDepOrder;
  const effectiveDepOrder =
    departureOrderProp !== undefined
      ? departureOrderProp
      : reconcileOrder(departuresWithAnnotations, rawDepOrder, depSeparatorIds);

  if (departureOrderProp === undefined) {
    dragRef.current.departureOrder = effectiveDepOrder;
    if (!arraysEqual(internalDepOrder, effectiveDepOrder)) {
      setInternalDepOrder(effectiveDepOrder);
    }
  }

  const rawArrOrder = arrivalOrderProp ?? dragRef.current.arrivalOrder ?? internalArrOrder;
  const effectiveArrOrder =
    arrivalOrderProp !== undefined
      ? arrivalOrderProp
      : reconcileOrder(arrivalsWithAnnotations, rawArrOrder, arrSeparatorIds);

  if (arrivalOrderProp === undefined) {
    dragRef.current.arrivalOrder = effectiveArrOrder;
    if (!arraysEqual(internalArrOrder, effectiveArrOrder)) {
      setInternalArrOrder(effectiveArrOrder);
    }
  }

  const orderedDepartures = applyRackOrder(
    departuresWithAnnotations,
    separators,
    "departures",
    effectiveDepOrder,
  );
  const orderedArrivals = applyRackOrder(
    arrivalsWithAnnotations,
    separators,
    "arrivals",
    effectiveArrOrder,
  );

  const draggedStrip =
    draggedStripProp !== undefined
      ? draggedStripProp
      : (dragRef.current.draggedStrip ?? internalDraggedStrip);
  const dropIndicator =
    dropIndicatorProp !== undefined
      ? dropIndicatorProp
      : (dragRef.current.dropIndicator ?? internalDropIndicator);

  const setDraggedStrip = (
    next: DraggedStripState | null | ((prev: DraggedStripState | null) => DraggedStripState | null),
  ) => {
    const resolved = typeof next === "function" ? next(dragRef.current.draggedStrip) : next;
    dragRef.current.draggedStrip = resolved;
    if (draggedStripProp === undefined) {
      setInternalDraggedStrip(resolved);
    }
  };

  const setDropIndicator = (
    next:
      DropIndicatorState | null | ((prev: DropIndicatorState | null) => DropIndicatorState | null),
  ) => {
    const resolved = typeof next === "function" ? next(dragRef.current.dropIndicator) : next;
    dragRef.current.dropIndicator = resolved;
    if (dropIndicatorProp === undefined) {
      setInternalDropIndicator(resolved);
    }
  };

  const handleAddSeparator = (section: "departures" | "arrivals") => {
    const newId = `sep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const newSep: StripSeparatorModel = {
      id: newId,
      stripType: "SEPARATOR",
      label: "",
      section,
      createdAt: Date.now(),
    };
    const nextSeps = [...separators, newSep];
    setSeparators(nextSeps);

    if (section === "departures") {
      const nextOrder = [...effectiveDepOrder, newId];
      dragRef.current.departureOrder = nextOrder;
      if (departureOrderProp === undefined) {
        setInternalDepOrder(nextOrder);
      }
    } else {
      const nextOrder = [...effectiveArrOrder, newId];
      dragRef.current.arrivalOrder = nextOrder;
      if (arrivalOrderProp === undefined) {
        setInternalArrOrder(nextOrder);
      }
    }

    setEditingSeparatorId(newId);
    setContextMenu(null);
  };

  const handleDeleteSeparator = (id: string) => {
    const nextSeps = separators.filter((s) => s.id !== id);
    setSeparators(nextSeps);

    const nextDepOrder = effectiveDepOrder.filter((item) => item !== id);
    dragRef.current.departureOrder = nextDepOrder;
    if (departureOrderProp === undefined) {
      setInternalDepOrder(nextDepOrder);
    }

    const nextArrOrder = effectiveArrOrder.filter((item) => item !== id);
    dragRef.current.arrivalOrder = nextArrOrder;
    if (arrivalOrderProp === undefined) {
      setInternalArrOrder(nextArrOrder);
    }

    if (editingSeparatorId === id) {
      setEditingSeparatorId(null);
    }
    setContextMenu(null);
  };

  const handleUpdateSeparatorLabel = (id: string, newLabel: string) => {
    const nextSeps = separators.map((s) => (s.id === id ? { ...s, label: newLabel } : s));
    setSeparators(nextSeps);
  };

  const handleRackContextMenu = (e: React.MouseEvent, section: "departures" | "arrivals") => {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      typeof target.closest === "function" &&
      target.closest(".strip, .departure-strip, .arrival-strip, .strip-separator")
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      section,
      type: "empty-space",
    });
  };

  const handleSeparatorContextMenu = (e: React.MouseEvent, separator: StripSeparatorModel) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      section: separator.section,
      type: "separator",
      separatorId: separator.id,
    });
  };

  const handleDragStart = (
    e: React.DragEvent,
    item: RackStripItem,
    section: "departures" | "arrivals",
    index: number,
  ) => {
    if (e.dataTransfer) {
      e.dataTransfer.setData?.("text/plain", item.id);
      e.dataTransfer.effectAllowed = "move";
    }
    setDraggedStrip({
      id: item.id,
      section,
      sourceIndex: index,
    });
  };

  const handleDragOver = (
    e: React.DragEvent,
    section: "departures" | "arrivals",
    hoverIndex: number,
    targetElement?: HTMLElement,
  ) => {
    const currentDragged =
      draggedStripProp !== undefined ? draggedStripProp : dragRef.current.draggedStrip;
    if (!currentDragged || currentDragged.section !== section) {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "none";
      }
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    e.stopPropagation?.();

    const el =
      targetElement ??
      (e.currentTarget as HTMLElement | undefined) ??
      (e.target as HTMLElement | undefined);
    let isUpper = true;

    const customEvent = e as unknown as { isLowerHalf?: boolean; isUpperHalf?: boolean };
    if (el && typeof el.getBoundingClientRect === "function") {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) {
        const midY = rect.top + rect.height / 2;
        isUpper = e.clientY < midY;
      } else if (customEvent.isLowerHalf !== undefined) {
        isUpper = !customEvent.isLowerHalf;
      } else if (customEvent.isUpperHalf !== undefined) {
        isUpper = !!customEvent.isUpperHalf;
      } else if (typeof e.clientY === "number") {
        isUpper = e.clientY < 48;
      }
    } else if (customEvent.isLowerHalf !== undefined) {
      isUpper = !customEvent.isLowerHalf;
    } else if (customEvent.isUpperHalf !== undefined) {
      isUpper = !!customEvent.isUpperHalf;
    } else if (typeof e.clientY === "number") {
      isUpper = e.clientY < 48;
    }

    const targetIndex = isUpper ? hoverIndex : hoverIndex + 1;
    setDropIndicator({ section, targetIndex });
  };

  const handleDragLeave = (e: React.DragEvent, section: "departures" | "arrivals") => {
    const related = e.relatedTarget as Node | null;
    const current = e.currentTarget as HTMLElement | null;
    if (current && related && typeof current.contains === "function" && current.contains(related)) {
      return;
    }
    const currentIndicator =
      dropIndicatorProp !== undefined ? dropIndicatorProp : dragRef.current.dropIndicator;
    if (currentIndicator?.section === section) {
      setDropIndicator(null);
    }
  };

  const handleDragEnd = (_e?: React.DragEvent) => {
    setDraggedStrip(null);
    setDropIndicator(null);
  };

  const handleDrop = (e: React.DragEvent, section: "departures" | "arrivals") => {
    const currentDragged =
      draggedStripProp !== undefined ? draggedStripProp : dragRef.current.draggedStrip;
    if (!currentDragged || currentDragged.section !== section) {
      return;
    }
    e.preventDefault();

    const currentIndicator =
      dropIndicatorProp !== undefined ? dropIndicatorProp : dragRef.current.dropIndicator;
    if (!currentIndicator || currentIndicator.section !== section) {
      setDraggedStrip(null);
      setDropIndicator(null);
      return;
    }

    const sourceIndex = currentDragged.sourceIndex;
    const targetIndex = currentIndicator.targetIndex;

    if (section === "departures") {
      const currentList = [...orderedDepartures];
      if (sourceIndex >= 0 && sourceIndex < currentList.length) {
        const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        const [movedItem] = currentList.splice(sourceIndex, 1);
        currentList.splice(insertIndex, 0, movedItem);
        const newOrder = currentList.map((s) => s.id);
        dragRef.current.departureOrder = newOrder;
        if (departureOrderProp === undefined) {
          setInternalDepOrder(newOrder);
        }
        onReorderStrips?.(
          "departures",
          currentList.filter((s): s is FlightStrip => !isStripSeparator(s)),
        );
        onReorderRack?.("departures", currentList);
      }
    } else {
      const currentList = [...orderedArrivals];
      if (sourceIndex >= 0 && sourceIndex < currentList.length) {
        const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
        const [movedItem] = currentList.splice(sourceIndex, 1);
        currentList.splice(insertIndex, 0, movedItem);
        const newOrder = currentList.map((s) => s.id);
        dragRef.current.arrivalOrder = newOrder;
        if (arrivalOrderProp === undefined) {
          setInternalArrOrder(newOrder);
        }
        onReorderStrips?.(
          "arrivals",
          currentList.filter((s): s is FlightStrip => !isStripSeparator(s)),
        );
        onReorderRack?.("arrivals", currentList);
      }
    }

    setDraggedStrip(null);
    setDropIndicator(null);
  };

  const renderStripList = (section: "departures" | "arrivals", items: RackStripItem[]) => {
    if (items.length === 0) {
      return (
        <div
          className="rack-empty"
          data-testid={`rack-empty-${section}`}
          onContextMenu={(e) => handleRackContextMenu(e, section)}
        >
          {section === "departures" ? "No departure strips" : "No arrival strips"}
        </div>
      );
    }

    const elements: React.ReactNode[] = [];
    const showIndicator = dropIndicator?.section === section;
    const targetIdx = dropIndicator?.targetIndex ?? -1;

    items.forEach((item, index) => {
      if (showIndicator && targetIdx === index) {
        elements.push(
          <div
            className="strip-drop-indicator"
            data-testid="strip-drop-indicator"
            key="drop-indicator"
          />,
        );
      }

      if (isStripSeparator(item)) {
        elements.push(
          <StripSeparator
            key={item.id}
            separator={item}
            isEditing={editingSeparatorId === item.id}
            isDragging={draggedStrip?.id === item.id}
            onUpdateLabel={handleUpdateSeparatorLabel}
            onStartEdit={(id) => setEditingSeparatorId(id)}
            onEndEdit={(id) => {
              if (editingSeparatorId === id) {
                setEditingSeparatorId(null);
              }
            }}
            onContextMenu={handleSeparatorContextMenu}
            onDragStart={(e) => handleDragStart(e, item, section, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, section, index)}
            onDrop={(e) => handleDrop(e, section)}
          />,
        );
      } else if (section === "departures") {
        const depStrip = item as DepartureStripData;
        elements.push(
          <DepartureStrip
            key={depStrip.id}
            strip={depStrip}
            selected={isStripSelected(depStrip)}
            indented={indentedStripIds.has(depStrip.id)}
            isDragging={draggedStrip?.id === depStrip.id}
            onSelect={() => onSelectStrip?.(depStrip)}
            onToggleIndent={handleToggleIndent}
            onDragStart={(e) => handleDragStart(e, depStrip, "departures", index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, "departures", index)}
            onDrop={(e) => handleDrop(e, "departures")}
            onUpdateAnnotation={handleUpdateAnnotation}
          />,
        );
      } else {
        const arrStrip = item as ArrivalStripData;
        elements.push(
          <ArrivalStrip
            key={arrStrip.id}
            strip={arrStrip}
            selected={isStripSelected(arrStrip)}
            indented={indentedStripIds.has(arrStrip.id)}
            isDragging={draggedStrip?.id === arrStrip.id}
            onSelect={() => onSelectStrip?.(arrStrip)}
            onToggleIndent={handleToggleIndent}
            onDragStart={(e) => handleDragStart(e, arrStrip, "arrivals", index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, "arrivals", index)}
            onDrop={(e) => handleDrop(e, "arrivals")}
            onUpdateAnnotation={handleUpdateAnnotation}
          />,
        );
      }
    });

    if (showIndicator && targetIdx >= items.length) {
      elements.push(
        <div
          className="strip-drop-indicator"
          data-testid="strip-drop-indicator"
          key="drop-indicator"
        />,
      );
    }

    return elements;
  };

  const [internalLayout, setInternalLayout] = useSafeState<"horizontal" | "vertical">(
    layoutModeProp ?? defaultLayout ?? "horizontal",
  );
  const layoutMode = layoutModeProp ?? internalLayout;

  const setLayoutMode = (
    next:
      "horizontal" | "vertical" | ((prev: "horizontal" | "vertical") => "horizontal" | "vertical"),
  ) => {
    const resolved = typeof next === "function" ? next(layoutMode) : next;
    if (layoutModeProp === undefined) {
      setInternalLayout(resolved);
    }
    onLayoutModeChange?.(resolved);
  };

  const [internalDepCollapsed, setInternalDepCollapsed] = useSafeState<boolean>(
    departuresCollapsedProp ?? defaultDeparturesCollapsed ?? false,
  );
  const departuresCollapsed = departuresCollapsedProp ?? internalDepCollapsed;

  const setDeparturesCollapsed = (next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(departuresCollapsed) : next;
    if (departuresCollapsedProp === undefined) {
      setInternalDepCollapsed(resolved);
    }
    onDeparturesCollapsedChange?.(resolved);
  };

  const [internalArrCollapsed, setInternalArrCollapsed] = useSafeState<boolean>(
    arrivalsCollapsedProp ?? defaultArrivalsCollapsed ?? false,
  );
  const arrivalsCollapsed = arrivalsCollapsedProp ?? internalArrCollapsed;

  const setArrivalsCollapsed = (next: boolean | ((prev: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(arrivalsCollapsed) : next;
    if (arrivalsCollapsedProp === undefined) {
      setInternalArrCollapsed(resolved);
    }
    onArrivalsCollapsedChange?.(resolved);
  };

  const [internalIndentedStripIds, setInternalIndentedStripIds] = useSafeState<Set<string>>(() => {
    const initial = new Set<string>(defaultIndentedStripIds);
    for (const dep of departures) {
      if (dep.indented) {
        initial.add(dep.id);
      }
    }
    for (const arr of arrivals) {
      if (arr.indented) {
        initial.add(arr.id);
      }
    }
    return initial;
  });

  // Reconcile active and indented strip IDs across telemetry updates
  const activeIds = new Set<string>([...departures.map((d) => d.id), ...arrivals.map((a) => a.id)]);

  const reconciledIndented = new Set<string>();
  // Retain active indented strips (pruning removed aircraft IDs)
  for (const id of internalIndentedStripIds) {
    if (activeIds.has(id)) {
      reconciledIndented.add(id);
    }
  }
  // Register newly seen strips and include those with strip.indented === true
  for (const strip of [...departures, ...arrivals]) {
    if (!seenStripIdsRef.current.has(strip.id)) {
      seenStripIdsRef.current.add(strip.id);
      if (strip.indented) {
        reconciledIndented.add(strip.id);
      }
    }
  }
  // Prune removed aircraft from seen set
  for (const id of Array.from(seenStripIdsRef.current)) {
    if (!activeIds.has(id)) {
      seenStripIdsRef.current.delete(id);
    }
  }

  if (
    indentedStripIdsProp === undefined &&
    !setsEqual(internalIndentedStripIds, reconciledIndented)
  ) {
    setInternalIndentedStripIds(reconciledIndented);
  }

  const indentedStripIds = indentedStripIdsProp ?? reconciledIndented;

  const handleToggleIndent = (stripId: string) => {
    const isCurrentlyIndented = indentedStripIds.has(stripId);
    const nextIndented = !isCurrentlyIndented;
    if (indentedStripIdsProp === undefined) {
      setInternalIndentedStripIds((prev) => {
        const next = new Set(prev);
        if (nextIndented) {
          next.add(stripId);
        } else {
          next.delete(stripId);
        }
        return next;
      });
    }
    onToggleIndent?.(stripId, nextIndented);
  };

  const isStripSelected = (strip: FlightStrip): boolean => {
    if (!selectedStripId) {
      return false;
    }
    const normSelected = selectedStripId.trim().toUpperCase();
    const normId = strip.id ? strip.id.trim().toUpperCase() : "";
    const normAcid = strip.acid ? strip.acid.trim().toUpperCase() : "";
    return (
      selectedStripId === strip.id ||
      selectedStripId === strip.acid ||
      normSelected === normId ||
      normSelected === normAcid
    );
  };

  const depIndicator =
    layoutMode === "horizontal"
      ? departuresCollapsed
        ? "▶"
        : "◀"
      : departuresCollapsed
        ? "▼"
        : "▲";

  const arrIndicator =
    layoutMode === "horizontal" ? (arrivalsCollapsed ? "◀" : "▶") : arrivalsCollapsed ? "▼" : "▲";

  return (
    <div className={`strips-board ${className ?? ""}`.trim()} data-testid="strips-board">
      {/* Two-Column / Two-Row Rack Bay Container */}
      <div
        className={`bay-container ${layoutMode === "vertical" ? "bay-vertical" : "bay-horizontal"}`}
        data-testid="bay-container"
      >
        {/* Left / Top Rack Column: Departures */}
        <section
          className={`rack-column rack-departures ${departuresCollapsed ? "collapsed" : ""}`.trim()}
          data-testid="rack-departures"
          data-rack="departures"
          aria-label="Departures rack"
          onClick={() => {
            if (departuresCollapsed) {
              setDeparturesCollapsed(false);
            }
          }}
          onDragOver={(e) => {
            const current =
              draggedStripProp !== undefined ? draggedStripProp : dragRef.current.draggedStrip;
            if (current && current.section !== "departures") {
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = "none";
              }
            }
          }}
        >
          <div
            className="rack-header"
            data-testid="rack-header-departures"
            onClick={() => {
              setDeparturesCollapsed((c) => !c);
            }}
          >
            <span className="rack-title">Departures</span>
            <div className="rack-header-actions" data-testid="rack-header-actions-departures">
              <button
                type="button"
                className="rack-collapse-btn"
                data-testid="collapse-departures-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeparturesCollapsed((c) => !c);
                }}
                title={departuresCollapsed ? "Expand departures rack" : "Collapse departures rack"}
                aria-label={
                  departuresCollapsed ? "Expand departures rack" : "Collapse departures rack"
                }
              >
                {depIndicator}
              </button>
            </div>
          </div>
          <div
            className="rack-strip-list"
            data-testid="rack-strip-list-departures"
            role="region"
            aria-label="Departures strip list"
            onContextMenu={(e) => handleRackContextMenu(e, "departures")}
            onDragOver={(e) => {
              const current =
                draggedStripProp !== undefined ? draggedStripProp : dragRef.current.draggedStrip;
              if (!current || current.section !== "departures") {
                if (e.dataTransfer) {
                  e.dataTransfer.dropEffect = "none";
                }
                return;
              }
              if (e.target === e.currentTarget) {
                e.preventDefault();
                if (e.dataTransfer) {
                  e.dataTransfer.dropEffect = "move";
                }
                const nextIndicator: DropIndicatorState = {
                  section: "departures",
                  targetIndex: orderedDepartures.length,
                };
                dragRef.current.dropIndicator = nextIndicator;
                setDropIndicator(nextIndicator);
              }
            }}
            onDragLeave={(e) => handleDragLeave(e, "departures")}
            onDrop={(e) => handleDrop(e, "departures")}
          >
            {renderStripList("departures", orderedDepartures)}
          </div>
        </section>

        {/* Right / Bottom Rack Column: Arrivals */}
        <section
          className={`rack-column rack-arrivals ${arrivalsCollapsed ? "collapsed" : ""}`.trim()}
          data-testid="rack-arrivals"
          data-rack="arrivals"
          aria-label="Arrivals rack"
          onClick={() => {
            if (arrivalsCollapsed) {
              setArrivalsCollapsed(false);
            }
          }}
          onDragOver={(e) => {
            const current =
              draggedStripProp !== undefined ? draggedStripProp : dragRef.current.draggedStrip;
            if (current && current.section !== "arrivals") {
              if (e.dataTransfer) {
                e.dataTransfer.dropEffect = "none";
              }
            }
          }}
        >
          <div
            className="rack-header"
            data-testid="rack-header-arrivals"
            onClick={() => {
              setArrivalsCollapsed((c) => !c);
            }}
          >
            <span className="rack-title">Arrivals</span>
            <div className="rack-header-actions" data-testid="rack-header-actions-arrivals">
              <button
                type="button"
                className="rack-collapse-btn"
                data-testid="collapse-arrivals-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setArrivalsCollapsed((c) => !c);
                }}
                title={arrivalsCollapsed ? "Expand arrivals rack" : "Collapse arrivals rack"}
                aria-label={arrivalsCollapsed ? "Expand arrivals rack" : "Collapse arrivals rack"}
              >
                {arrIndicator}
              </button>
            </div>
          </div>
          <div
            className="rack-strip-list"
            data-testid="rack-strip-list-arrivals"
            role="region"
            aria-label="Arrivals strip list"
            onContextMenu={(e) => handleRackContextMenu(e, "arrivals")}
            onDragOver={(e) => {
              const current =
                draggedStripProp !== undefined ? draggedStripProp : dragRef.current.draggedStrip;
              if (!current || current.section !== "arrivals") {
                if (e.dataTransfer) {
                  e.dataTransfer.dropEffect = "none";
                }
                return;
              }
              if (e.target === e.currentTarget) {
                e.preventDefault();
                if (e.dataTransfer) {
                  e.dataTransfer.dropEffect = "move";
                }
                const nextIndicator: DropIndicatorState = {
                  section: "arrivals",
                  targetIndex: orderedArrivals.length,
                };
                dragRef.current.dropIndicator = nextIndicator;
                setDropIndicator(nextIndicator);
              }
            }}
            onDragLeave={(e) => handleDragLeave(e, "arrivals")}
            onDrop={(e) => handleDrop(e, "arrivals")}
          >
            {renderStripList("arrivals", orderedArrivals)}
          </div>
        </section>
      </div>

      {/* Strips Board Footer with Minimal Layout Toggle Button */}
      <footer className="strips-board-footer" data-testid="strips-board-footer">
        <button
          type="button"
          className="strips-layout-toggle-btn"
          data-testid="strips-layout-toggle-btn"
          onClick={() => setLayoutMode((m) => (m === "horizontal" ? "vertical" : "horizontal"))}
          title={
            layoutMode === "horizontal"
              ? "Switch to stacked vertical layout"
              : "Switch to side-by-side columns layout"
          }
        >
          {layoutMode === "horizontal" ? "Stacked" : "Columns"}
        </button>
      </footer>

      {/* Custom Context Menu */}
      {contextMenu && contextMenu.visible && (
        <StripsContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={
            contextMenu.type === "empty-space"
              ? [
                  {
                    label: "Add Separator",
                    action: () => handleAddSeparator(contextMenu.section),
                    testId: `context-menu-add-separator-${contextMenu.section}`,
                  },
                ]
              : [
                  {
                    label: "Delete",
                    action: () => {
                      if (contextMenu.separatorId) {
                        handleDeleteSeparator(contextMenu.separatorId);
                      }
                    },
                    danger: true,
                    testId: "context-menu-delete-separator",
                  },
                  {
                    label: "Edit Text",
                    action: () => {
                      if (contextMenu.separatorId) {
                        setEditingSeparatorId(contextMenu.separatorId);
                      }
                    },
                    testId: "context-menu-edit-separator",
                  },
                ]
          }
        />
      )}
    </div>
  );
}
