import React from "react";
import type { DepartureStripData } from "./types";
import { formatBeaconCode, formatEquipment, formatRevisionIndex } from "./stripFormatter";
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
  const formattedRevision = formatRevisionIndex(strip.revisionNumber);
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
      className={`departure-strip ${selected ? "strip-selected" : ""} ${className ?? ""}`.trim()}
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
      {/* Column 1: ACID, Revision, Formatted Equipment, Computer ID (~18%) */}
      <div className="strip-col-1" data-col="1">
        <div className="strip-col-1-row-1">
          <div className="strip-box box-1 box-acid" data-box="1" data-box-label="1">
            <span className="box-label">1</span>
            <span className="box-value strip-acid">{strip.acid}</span>
          </div>
          <div className="strip-box box-2 box-rev" data-box="2" data-box-label="2">
            <span className="box-label">2</span>
            <span className="box-value strip-rev">{formattedRevision}</span>
          </div>
        </div>
        <div className="strip-box box-3 box-equip" data-box="3" data-box-label="3">
          <span className="box-label">3</span>
          <span className="box-value strip-equip">{formattedEquipment}</span>
        </div>
        <div className="strip-box box-4 box-cid" data-box="4" data-box-label="4">
          <span className="box-label">4</span>
          <span className="box-value strip-cid">{strip.cid ?? ""}</span>
        </div>
      </div>

      {/* Column 2: Beacon code, Proposed departure time, Requested altitude (~14%) */}
      <div className="strip-col-2" data-col="2">
        <div className="strip-box box-5 box-beacon" data-box="5" data-box-label="5">
          <span className="box-label">5</span>
          <span className="box-value strip-beacon">{formattedBeacon}</span>
        </div>
        <div className="strip-box box-6 box-time" data-box="6" data-box-label="6">
          <span className="box-label">6</span>
          <span className="box-value strip-dep-time">{strip.proposedDepartureTime}</span>
        </div>
        <div className="strip-box box-7 box-altitude" data-box="7" data-box-label="7">
          <span className="box-label">7</span>
          <span className="box-value strip-req-alt">{strip.requestedAltitude}</span>
        </div>
      </div>

      {/* Column 3: Departure airport, upper annotations (8A, 8B), lower annotations (10-18) (~46%) */}
      <div className="strip-col-3" data-col="3">
        <div className="strip-col-3-upper">
          <div className="strip-box box-8 box-departure-airport" data-box="8" data-box-label="8">
            <span className="box-label">8</span>
            <span className="box-value strip-dep-airport">{strip.departureAirport}</span>
          </div>
          <div className="strip-box box-8a box-8A box-annotation" data-box="8A" data-box-label="8A">
            <span className="box-label">8A</span>
            <span className="box-value strip-annotation-8a">
              {strip.annotationBoxes?.box8A ?? ""}
            </span>
          </div>
          <div className="strip-box box-8b box-8B box-annotation" data-box="8B" data-box-label="8B">
            <span className="box-label">8B</span>
            <span className="box-value strip-annotation-8b">
              {strip.annotationBoxes?.box8B ?? ""}
            </span>
          </div>
        </div>
        <div className="strip-col-3-lower">
          {LOWER_BOX_NUMBERS.map((boxNum, index) => (
            <div
              key={boxNum}
              className={`strip-box box-${boxNum} box-annotation`}
              data-box={boxNum.toString()}
              data-box-label={boxNum.toString()}
            >
              <span className="box-label">{boxNum}</span>
              <span className="box-value strip-annotation-lower">
                {strip.annotationBoxes?.boxes10to18?.[index] ?? ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Column 4: Route, destination airport, remarks (Box 9) (~22%) */}
      <div className="strip-col-4 strip-col-4-departure" data-col="4">
        <div className="strip-box box-9 box-route-dest-remarks" data-box="9" data-box-label="9">
          <span className="box-label">9</span>
          <div className="strip-route">{strip.route}</div>
          <div className="strip-dest-remarks">
            <span className="strip-dest">{strip.destinationAirport}</span>
            {strip.remarks && <span className="strip-remarks">{strip.remarks}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
