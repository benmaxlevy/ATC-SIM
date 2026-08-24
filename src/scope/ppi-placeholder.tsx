import type { MouseEvent, PointerEvent, ReactNode, WheelEvent } from "react";
import type { DcbDock } from "./dcbPref";

export const PpiPlaceholderId = "ppi-placeholder";

export interface PpiPlaceholderProps {
  children?: ReactNode;
  /** DCB cell grid sits on this glass, along the docked PPI edge. */
  header?: ReactNode;
  dock?: DcbDock;
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
 * Trainer delta: DCB cells sit on the PPI glass along one edge (TOP default;
 * LEFT/RIGHT/BOTTOM via AUX DCB position). The canvas in `.ppi-draw` is the
 * drawable PPI (T02-01 camera view size already minus DCB thickness).
 * Range/center via keys, wheel, and DCB RANGE (not CRC). Right-drag slew
 * (middle-drag still works; not CRC). Click selects a track and
 * focuses the PPI so scope-focus H toggles history.
 * Not NAS STARS.
 */
export function PpiPlaceholder({
  header,
  dock = "TOP",
  children,
  onCanvasClick,
  onCanvasDoubleClick,
  onCanvasWheel,
  onCanvasPointerDown,
  onCanvasPointerMove,
  onCanvasPointerUp,
  onCanvasContextMenu,
}: PpiPlaceholderProps) {
  return (
    <div className="ppi-host" data-dcb-dock={dock}>
      {header}
      <div className="ppi-draw">
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
        {children}
      </div>
    </div>
  );
}
