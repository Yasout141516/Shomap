import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import { Protocol } from "pmtiles";
import { basemapStyle, tilesAvailable } from "./style";

let protocolAdded = false;
function ensureProtocol() {
  if (protocolAdded) return;
  maplibregl.addProtocol("pmtiles", new Protocol().tile);
  protocolAdded = true;
}

/** Dhaka, padded a little beyond the demo bounds. */
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [90.22, 23.62],
  [90.58, 23.96],
];

export interface BaseMapProps {
  center: { lat: number; lng: number };
  zoom?: number;
  className?: string;
  onReady?: (map: MlMap) => void;
  onTilesMissing?: () => void;
  ariaLabel: string;
}

/** A MapLibre map over the local basemap. Children manage their own markers/layers via onReady. */
export function BaseMap({ center, zoom = 13, className, onReady, onTilesMissing, ariaLabel }: BaseMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const readyCb = useRef(onReady);
  readyCb.current = onReady;
  const missingCb = useRef(onTilesMissing);
  missingCb.current = onTilesMissing;

  useEffect(() => {
    let cancelled = false;
    ensureProtocol();
    void tilesAvailable().then((ok) => {
      if (cancelled || !el.current) return;
      if (!ok) missingCb.current?.();
      const map = new maplibregl.Map({
        container: el.current,
        style: basemapStyle(ok),
        center: [center.lng, center.lat],
        zoom,
        minZoom: 10.5,
        maxZoom: 17.5,
        maxBounds: MAX_BOUNDS,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      map.on("error", (e) => {
        // A tile failure must not break pins; just note it.
        if ((e.error as { status?: number } | undefined)?.status) missingCb.current?.();
      });
      mapRef.current = map;
      map.on("load", () => {
        if (cancelled) return;
        setReady(true);
        readyCb.current?.(map);
      });
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // The map is created once; later centre changes go through flyTo by the owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // MapLibre adds its own classes (incl. overflow clipping) to the inner div, so React must not own its className.
  return (
    <div className={`basemap ${className ?? ""}${ready ? " is-ready" : ""}`} role="region" aria-label={ariaLabel}>
      <div ref={el} className="basemap-canvas" />
    </div>
  );
}
