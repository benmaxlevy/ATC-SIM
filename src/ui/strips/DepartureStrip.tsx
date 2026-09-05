import * as React from "react";
import { useEffect, useRef, useState } from "react";
import type { DepartureStripData } from "./types";
import { formatBeaconCode, formatEquipment, formatProposedDepartureTime } from "./stripFormatter";
import "./strips.css";

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

function useSafeEffect(effect: React.EffectCallback, deps?: React.DependencyList): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dispatcher = (React as any)?.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED
    ?.ReactCurrentDispatcher?.current;
  if (!dispatcher) {
    return;
  }
  useEffect(effect, deps);
}

export interface DepartureStripProps {
  strip: DepartureStripData;
  onSelect?: (stripId: string) => void;
  selected?: boolean;
  className?: string;
  indented?: boolean;
  onToggleIndent?: (stripId: string) => void;
  draggable?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onUpdateAnnotation?: (stripId: string, boxKey: string, value: string) => void;
  editingBox?: string | null;
  onEditingBoxChange?: (boxKey: string | null) => void;
}

const LOWER_BOX_NUMBERS = [10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

function getBoxValue(strip: DepartureStripData, boxKey: string): string {
  const normKey = boxKey.toUpperCase();
  if (normKey === "8A" || normKey === "BOX8A") {
    return strip.annotationBoxes?.box8A ?? "";
  }
  if (normKey === "8B" || normKey === "BOX8B") {
    return strip.annotationBoxes?.box8B ?? "";
  }
  const boxNum = parseInt(boxKey, 10);
  if (!isNaN(boxNum) && boxNum >= 10 && boxNum <= 18) {
    return strip.annotationBoxes?.boxes10to18?.[boxNum - 10] ?? "";
  }
  return "";
}

export function DepartureStrip({
  strip,
  onSelect,
  selected,
  className,
  indented,
  onToggleIndent,
  draggable,
  isDragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onUpdateAnnotation,
  editingBox: editingBoxProp,
  onEditingBoxChange,
}: DepartureStripProps) {
  const isIndented = indented ?? strip.indented ?? false;
  const formattedEquipment = formatEquipment(strip.rawType, strip.equipmentSuffix, {
    isHeavy: strip.isHeavy,
    cwtCategory: strip.cwtCategory,
  });
  const formattedBeacon = formatBeaconCode(strip.beaconCode);

  const [internalEditingBox, setInternalEditingBox] = useSafeState<string | null>(null);
  const editingBox = editingBoxProp !== undefined ? editingBoxProp : internalEditingBox;

  const [draft, setDraft] = useSafeState<string>(() => {
    return editingBox ? getBoxValue(strip, editingBox) : "";
  });
  const inputRef = useSafeRef<HTMLInputElement | null>(null);

  useSafeEffect(() => {
    if (editingBox) {
      setDraft(getBoxValue(strip, editingBox));
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }
  }, [editingBox]);

  const startEditing = (e: React.MouseEvent, boxKey: string, initialVal: string) => {
    e.preventDefault?.();
    e.stopPropagation?.();
    if (editingBoxProp === undefined) {
      setInternalEditingBox(boxKey);
    }
    setDraft(initialVal);
    onEditingBoxChange?.(boxKey);
  };

  const handleCommit = (boxKey: string) => {
    const trimmed = draft.trim().toUpperCase();
    if (editingBoxProp === undefined) {
      setInternalEditingBox(null);
    }
    onEditingBoxChange?.(null);
    onUpdateAnnotation?.(strip.id, boxKey, trimmed);
  };

  const handleCancel = () => {
    if (editingBoxProp === undefined) {
      setInternalEditingBox(null);
    }
    setDraft("");
    onEditingBoxChange?.(null);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, boxKey: string) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommit(boxKey);
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleClick = () => {
    onSelect?.(strip.id);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation?.();
    onToggleIndent?.(strip.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (e.shiftKey) {
        onToggleIndent?.(strip.id);
      } else {
        onSelect?.(strip.id);
      }
    }
  };

  return (
    <div
      className={`strip departure-strip ${selected ? "strip-selected" : ""} ${isIndented ? "strip-indented" : ""} ${isDragging ? "strip-dragging" : ""} ${className ?? ""}`.trim()}
      role="button"
      tabIndex={0}
      draggable={editingBox !== null ? false : (draggable ?? true)}
      data-strip-id={strip.id}
      data-strip-type="DEPARTURE"
      data-strip-acid={strip.acid}
      data-testid="departure-strip"
      aria-label={`Departure strip ${strip.acid}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Column 1 (~22%): Identification */}
      <div className="strip-col col-ident" data-col="1">
        <div className="line acid strip-acid" data-box="1">
          {strip.acid}
        </div>
        <div className="line rev strip-rev" data-box="2">
          {strip.revisionNumber && strip.revisionNumber > 0 ? strip.revisionNumber : ""}
        </div>
        <div className="line type strip-equip" data-box="3">
          {formattedEquipment}
        </div>
        <div className="line-bottom cid-row" data-box="4">
          <span className="cid strip-cid">{strip.cid ?? ""}</span>
        </div>
      </div>

      {/* Column 2 (~10%): Fix Data (Squawk, P-Time, Requested Alt) */}
      <div className="strip-col col-fix-data" data-col="2">
        <div className="cell beacon strip-beacon" data-box="5">
          {formattedBeacon}
        </div>
        <div className="cell p-time strip-dep-time" data-box="6">
          {formatProposedDepartureTime(strip.proposedDepartureTime)}
        </div>
        <div className="cell alt strip-req-alt" data-box="7">
          {strip.requestedAltitude}
        </div>
      </div>

      {/* Column 3 (~14%): Local/Departure Data (Dep Airport, 8A, 8B) */}
      <div className="strip-col col-local" data-col="3">
        <div className="cell box-8 strip-dep-airport" data-box="8">
          {strip.departureAirport}
        </div>
        <div
          className="cell box-8a strip-annotation-8a"
          data-box="8A"
          data-testid="box-8a"
          onClick={(e) => startEditing(e, "8A", strip.annotationBoxes?.box8A ?? "")}
          onDoubleClick={(e) => startEditing(e, "8A", strip.annotationBoxes?.box8A ?? "")}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {editingBox === "8A" ? (
            <input
              ref={inputRef}
              type="text"
              className="strip-annotation-input"
              data-testid="annotation-input-8A"
              data-box="8A"
              value={draft}
              maxLength={10}
              autoFocus
              onChange={(e) => setDraft(e.target.value.toUpperCase())}
              onBlur={() => handleCommit("8A")}
              onKeyDown={(e) => handleInputKeyDown(e, "8A")}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="Annotation box 8A"
            />
          ) : (
            (strip.annotationBoxes?.box8A ?? "")
          )}
        </div>
        <div
          className="cell box-8b strip-annotation-8b"
          data-box="8B"
          data-testid="box-8b"
          onClick={(e) => startEditing(e, "8B", strip.annotationBoxes?.box8B ?? "")}
          onDoubleClick={(e) => startEditing(e, "8B", strip.annotationBoxes?.box8B ?? "")}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {editingBox === "8B" ? (
            <input
              ref={inputRef}
              type="text"
              className="strip-annotation-input"
              data-testid="annotation-input-8B"
              data-box="8B"
              value={draft}
              maxLength={10}
              autoFocus
              onChange={(e) => setDraft(e.target.value.toUpperCase())}
              onBlur={() => handleCommit("8B")}
              onKeyDown={(e) => handleInputKeyDown(e, "8B")}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              aria-label="Annotation box 8B"
            />
          ) : (
            (strip.annotationBoxes?.box8B ?? "")
          )}
        </div>
      </div>

      {/* Column 4 (~36%): Route, Destination, Remarks */}
      <div className="strip-col col-route" data-col="4">
        <div className="route-text" data-box="9">
          <span className="strip-route">{strip.route}</span>{" "}
          <span className="strip-dest">{strip.destinationAirport}</span>
          {strip.remarks ? <span className="strip-remarks"> {strip.remarks}</span> : null}
        </div>
      </div>

      {/* Column 5 (~18%): 3x3 Annotation Matrix (Boxes 10–18) */}
      <div className="strip-col col-matrix annotation-grid-3x3" data-col="5">
        {LOWER_BOX_NUMBERS.map((boxNum, index) => {
          const boxKey = boxNum.toString();
          const isEditingThis = editingBox === boxKey;
          const currentVal = strip.annotationBoxes?.boxes10to18?.[index] ?? "";
          return (
            <div
              key={boxNum}
              className={`matrix-cell annotation-cell box-${boxNum}`}
              data-box={boxKey}
              data-testid={`box-${boxNum}`}
              onClick={(e) => startEditing(e, boxKey, currentVal)}
              onDoubleClick={(e) => startEditing(e, boxKey, currentVal)}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {isEditingThis ? (
                <input
                  ref={inputRef}
                  type="text"
                  className="strip-annotation-input"
                  data-testid={`annotation-input-${boxNum}`}
                  data-box={boxKey}
                  value={draft}
                  maxLength={10}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value.toUpperCase())}
                  onBlur={() => handleCommit(boxKey)}
                  onKeyDown={(e) => handleInputKeyDown(e, boxKey)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  aria-label={`Annotation box ${boxNum}`}
                />
              ) : (
                <span className="strip-annotation-lower">{currentVal}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
