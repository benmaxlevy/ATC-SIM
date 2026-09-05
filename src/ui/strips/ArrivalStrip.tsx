import React from "react";
import type { ArrivalStripData } from "./types";
import {
  formatArrivalTime,
  formatBeaconCode,
  formatEquipment,
  formatFlightRules,
} from "./stripFormatter";
import "./strips.css";

export interface ArrivalStripProps {
  strip: ArrivalStripData;
  onSelect?: (stripId: string) => void;
  selected?: boolean;
  className?: string;
  indented?: boolean;
  onToggleIndent?: (stripId: string) => void;
}

const LOWER_BOX_NUMBERS = [10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

export function ArrivalStrip({
  strip,
  onSelect,
  selected,
  className,
  indented,
  onToggleIndent,
}: ArrivalStripProps) {
  const isIndented = indented ?? strip.indented ?? false;
  const formattedEquipment = formatEquipment(strip.rawType, strip.equipmentSuffix, {
    isHeavy: strip.isHeavy,
    cwtCategory: strip.cwtCategory,
  });
  const formattedBeacon = formatBeaconCode(strip.beaconCode);

  const handleClick = () => {
    onSelect?.(strip.id);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
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
      className={`strip arrival-strip ${selected ? "strip-selected" : ""} ${isIndented ? "strip-indented" : ""} ${className ?? ""}`.trim()}
      role="button"
      tabIndex={0}
      data-strip-id={strip.id}
      data-strip-type="ARRIVAL"
      data-strip-acid={strip.acid}
      data-testid="arrival-strip"
      aria-label={`Arrival strip ${strip.acid}`}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onKeyDown={handleKeyDown}
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

      {/* Column 2 (~10%): Fix Data (Squawk, Previous Fix, Coordination Fix) */}
      <div className="strip-col col-fix-data" data-col="2">
        <div className="cell beacon strip-beacon" data-box="5">
          {formattedBeacon}
        </div>
        <div className="cell prev-fix strip-prev-fix" data-box="6">
          {strip.previousFix ?? ""}
        </div>
        <div className="cell coord-fix strip-coord-fix" data-box="7">
          {strip.coordinationFix}
        </div>
      </div>

      {/* Column 3 (~14%): Local/Arrival Data (ETA, 8A, 8B) */}
      <div className="strip-col col-local" data-col="3">
        <div className="cell box-8 strip-eta" data-box="8">
          {formatArrivalTime(strip.estimatedTimeOfArrival)}
        </div>
        <div className="cell box-8a strip-annotation-8a" data-box="8A">
          {strip.annotationBoxes?.box8A ?? ""}
        </div>
        <div className="cell box-8b strip-annotation-8b" data-box="8B">
          {strip.annotationBoxes?.box8B ?? ""}
        </div>
      </div>

      {/* Column 4 (~36%): Flight Rules, Destination, Remarks */}
      <div className="strip-col col-route col-route-arrival" data-col="4">
        <div className="cell flight-rules strip-flight-rules" data-box="9">
          {formatFlightRules(strip.flightRules)}
        </div>
        <div className="cell dest-remarks" data-box="9A">
          <span className="strip-dest">{strip.destinationAirport}</span>
          {strip.remarks ? <span className="strip-remarks"> {strip.remarks}</span> : null}
        </div>
      </div>

      {/* Column 5 (~18%): 3x3 Annotation Matrix (Boxes 10–18) */}
      <div className="strip-col col-matrix annotation-grid-3x3" data-col="5">
        {LOWER_BOX_NUMBERS.map((boxNum, index) => (
          <div
            key={boxNum}
            className={`matrix-cell annotation-cell box-${boxNum}`}
            data-box={boxNum.toString()}
          >
            <span className="strip-annotation-lower">
              {strip.annotationBoxes?.boxes10to18?.[index] ?? ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
