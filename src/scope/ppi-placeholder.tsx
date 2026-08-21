import type { MouseEvent } from "react";

export const PpiPlaceholderId = "ppi-placeholder";

export interface PpiPlaceholderProps {
  onCanvasClick?: (event: MouseEvent<HTMLCanvasElement>) => void;
}

/**
 * Analog: CRC STARS display (docs.virtualnas.net/crc/stars).
 * Trainer delta: full-area Canvas2D PPI host; ticks + callsign text, no maps
 * or datablocks. Click on the canvas selects a track. Not NAS STARS.
 */
export function PpiPlaceholder({ onCanvasClick }: PpiPlaceholderProps) {
  return (
    <div className="ppi-host">
      <canvas
        id={PpiPlaceholderId}
        className="ppi-canvas"
        aria-label="PPI"
        onClick={onCanvasClick}
      />
    </div>
  );
}
