import type { StyleSpecification, LayerSpecification } from "maplibre-gl";
import { layers, namedFlavor } from "@protomaps/basemaps";

export const PMTILES_PATH = "/offline/dhaka.pmtiles";

/**
 * Muted grayscale basemap from the local Dhaka PMTiles file (spec §2). Symbol layers are
 * dropped: MapLibre can't shape Bengali, so all labels are HTML overlays in the current
 * language. With no tiles, a plain background keeps pins working (PRD §12.5 partial state).
 */
export function basemapStyle(tilesAvailable: boolean): StyleSpecification {
  const background: LayerSpecification = { id: "background", type: "background", paint: { "background-color": "#EEEBE3" } };
  if (!tilesAvailable) return { version: 8, sources: {}, layers: [background] };
  const flavor = {
    ...namedFlavor("grayscale"),
    background: "#EEEBE3",
    earth: "#F2EFE8",
    water: "#C8D5D9",
    park_a: "#E3E8DC",
    park_b: "#E3E8DC",
  };
  const base = (layers("protomaps", flavor, { lang: "en" }) as LayerSpecification[]).filter((l) => l.type !== "symbol");
  return {
    version: 8,
    sources: {
      protomaps: {
        type: "vector",
        url: `pmtiles://${window.location.origin}${PMTILES_PATH}`,
        attribution: "© OpenStreetMap contributors · Protomaps",
      },
    },
    layers: base,
  };
}

let tilesCheck: Promise<boolean> | null = null;
/** HEAD request once per page load: is the offline map file being served? */
export function tilesAvailable(): Promise<boolean> {
  tilesCheck ??= fetch(PMTILES_PATH, { method: "HEAD" })
    .then((r) => r.ok)
    .catch(() => false);
  return tilesCheck;
}
