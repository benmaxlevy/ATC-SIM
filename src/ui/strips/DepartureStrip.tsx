import React from "react";
import type { DepartureStripData } from "./types";
import { formatBeaconCode, formatEquipment, formatProposedDepartureTime } from "./stripFormatter";
import "./strips.css";

export interface DepartureStripProps {
  strip: DepartureStripData;
  onSelect?: (stripId: string) => void;
  selected?: boolean;
  className?: string;
}

const LOWER_BOX_NUMBERS = [10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

export function DepartureStrip({ strip, onSelect, selected, className }: DepartureStripProps) {
  const formattedEquipment = formatEquipment(strip.rawType, strip.equipmentSuffix, {
    isHeavy: strip.isHeavy,
    cwtCategory: strip.cwtCategory,
  });
  const formattedBeacon = formatBeaconCode(strip.beaconCode);

  const handleClick = () => {
    onSelect?.(strip.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect?.(strip.id);
    }
  };

  return (
    <div
      className={`strip departure-strip ${selected ? "strip-selected" : ""} ${className ?? ""}`.trim()}
      role="button"
      tabIndex={0}
      data-strip-id={strip.id}
      data-strip-type="DEPARTURE"
      data-strip-acid={strip.acid}
      data-testid="departure-strip"
      aria-label={`Departure strip ${strip.acid}`}
      onClick={handleClick}
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
        <div className="cell box-8a strip-annotation-8a" data-box="8A">
          {strip.annotationBoxes?.box8A ?? ""}
        </div>
        <div className="cell box-8b strip-annotation-8b" data-box="8B">
          {strip.annotationBoxes?.box8B ?? ""}
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
