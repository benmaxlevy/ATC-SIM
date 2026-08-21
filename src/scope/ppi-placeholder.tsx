import type { MouseEvent, PointerEvent, WheelEvent } from "react";

export const PpiPlaceholderId = "ppi-placeholder";

export interface PpiPlaceholderProps {
  onCanvasClick?: (event: MouseEvent<HTMLCanvasElement>) => void;
  onCanvasDoubleClick?: (event: MouseEvent<HTMLCanvasElement>) => void;
  onCanvasWheel?: (event: WheelEvent<HTMLCanvasElement>) => void;
  onCanvasPointerDown?: (event: PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerMove?: (event: PointerEvent<HTMLCanvasElement>) => void;
  onCanvasPointerUp?: (event: PointerEvent<HTMLCanvasElement>) => void;
  onCanvasContextMenu?: (event: MouseEvent<HTMLCanvasElement>) => void;
}

/**
 * Analog: CRC STARS display (docs.virtualnas.net/crc/stars — R07).
 * Trainer delta: full-area Canvas2D PPI host; range/center via keys and wheel,
 * middle-drag pan (not CRC). Click selects a track and focuses the PPI so
 * scope-focus H toggles history. Not NAS STARS.
 */
export function PpiPlaceholder({
  onCanvasClick,
  onCanvasDoubleClick,
  onCanvasWheel,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasContextMenu,
}: PpiPlaceholderProps) {
  return (
    <div className="ppi-host">
      <canvas
        id={PpiPlaceholderId}
        className="ppi-canvas"
        tabIndex={0}
        aria-label="PPI"
        onClick={onCanvasClick}
        onDoubleClick={onCanvasDoubleClick}
        onWheel={onCanvasWheel}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp}
        onContextMenu={onCanvasContextMenu}
      />
    </div>
  );
}
