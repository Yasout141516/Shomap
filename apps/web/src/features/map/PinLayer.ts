import maplibregl, { type Map as MlMap } from "maplibre-gl";
import Supercluster from "supercluster";
import { URGENCIES, URGENCY_ORDER, type IncidentDTO, type Urgency } from "@shomap/shared";
import { pinSvg, URGENCY_COLOR } from "../../ui/pin";
import { categoryIconSvg } from "../../ui/icons";

interface PinProps {
  id: string;
  maxU: number;
}

export interface PinLayerOptions {
  iconFor: (categoryId: string) => string;
  label: (inc: IncidentDTO) => string;
  clusterLabel: (count: number) => string;
  onSelect: (id: string) => void;
}

const HOUR = 3_600_000;

/**
 * HTML markers over MapLibre: each pin is a real <button> (focusable, labelled for screen
 * readers, PRD §12.7). Points cluster below zoom 15; an active SOS never clusters.
 */
export class PinLayer {
  private markers = new Map<string, { marker: maplibregl.Marker; sig: string }>();
  private byId = new Map<string, IncidentDTO>();
  private index = new Supercluster<PinProps, { maxU: number }>({
    radius: 52,
    maxZoom: 14,
    map: (p) => ({ maxU: p.maxU }),
    reduce: (acc, p) => {
      acc.maxU = Math.max(acc.maxU, p.maxU);
    },
  });
  private sos: IncidentDTO[] = [];
  private selected: string | null = null;
  private readonly onMove = () => this.render();

  constructor(
    private readonly map: MlMap,
    private opts: PinLayerOptions,
  ) {
    map.on("moveend", this.onMove);
  }

  setOptions(opts: PinLayerOptions) {
    this.opts = opts;
    for (const { marker } of this.markers.values()) marker.remove();
    this.markers.clear();
    this.render();
  }

  setData(incidents: IncidentDTO[]) {
    this.byId = new Map(incidents.map((i) => [i.id, i]));
    this.sos = incidents.filter((i) => i.sos?.state === "active");
    const pts = incidents.filter((i) => i.sos?.state !== "active");
    this.index.load(
      pts.map((i) => ({
        type: "Feature" as const,
        properties: { id: i.id, maxU: URGENCY_ORDER[i.urgency] },
        geometry: { type: "Point" as const, coordinates: [i.lng, i.lat] },
      })),
    );
    this.render();
  }

  setSelected(id: string | null) {
    this.selected = id;
    for (const [key, { marker }] of this.markers) marker.getElement().classList.toggle("is-selected", key === `p-${id}`);
  }

  destroy() {
    this.map.off("moveend", this.onMove);
    for (const { marker } of this.markers.values()) marker.remove();
    this.markers.clear();
  }

  private render() {
    const b = this.map.getBounds();
    const zoom = Math.round(this.map.getZoom());
    const clusters = this.index.getClusters([b.getWest() - 0.01, b.getSouth() - 0.01, b.getEast() + 0.01, b.getNorth() + 0.01], zoom);
    const want = new Map<string, { lngLat: [number, number]; sig: string; build: () => HTMLElement }>();
    const now = Date.now();

    for (const c of clusters) {
      const [lng, lat] = c.geometry.coordinates as [number, number];
      const props = c.properties as Partial<Supercluster.ClusterProperties> & { maxU: number; id?: string };
      if (props.cluster) {
        const count = props.point_count!;
        const clusterId = props.cluster_id!;
        const u = URGENCIES[props.maxU] as Urgency;
        want.set(`c-${clusterId}`, {
          lngLat: [lng, lat],
          sig: `${count}|${u}`,
          build: () => {
            const el = document.createElement("button");
            el.className = `cluster u-${u}`;
            el.style.setProperty("--c", URGENCY_COLOR[u]);
            el.textContent = String(count);
            el.setAttribute("aria-label", this.opts.clusterLabel(count));
            el.addEventListener("click", (e) => {
              e.stopPropagation();
              const z = Math.min(this.index.getClusterExpansionZoom(clusterId), 16);
              this.map.easeTo({ center: [lng, lat], zoom: z });
            });
            return el;
          },
        });
      } else if (props.id) {
        const inc = this.byId.get(props.id);
        if (inc) want.set(`p-${inc.id}`, this.pinSpec(inc, now));
      }
    }
    for (const inc of this.sos) want.set(`p-${inc.id}`, this.pinSpec(inc, now));

    for (const [key, cur] of this.markers) {
      const w = want.get(key);
      if (!w || w.sig !== cur.sig) {
        cur.marker.remove();
        this.markers.delete(key);
      }
    }
    for (const [key, w] of want) {
      if (this.markers.has(key)) continue;
      const el = w.build();
      if (key === `p-${this.selected}`) el.classList.add("is-selected");
      const marker = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(w.lngLat).addTo(this.map);
      this.markers.set(key, { marker, sig: w.sig });
    }
  }

  private pinSpec(inc: IncidentDTO, now: number) {
    const sosActive = inc.sos?.state === "active";
    const fresh = inc.urgency === "high" && now - Date.parse(inc.createdAt) < HOUR;
    const faded = inc.status === "resolved" || inc.status === "closed";
    const label = this.opts.label(inc);
    const icon = this.opts.iconFor(inc.categoryId);
    return {
      lngLat: [inc.lng, inc.lat] as [number, number],
      sig: `${inc.urgency}|${inc.verification}|${inc.status}|${sosActive}|${fresh}|${label}`,
      build: () => {
        const el = document.createElement("button");
        el.className = `pin u-${inc.urgency} v-${inc.verification}${sosActive ? " pin-sos" : ""}${fresh ? " pin-fresh" : ""}${faded ? " pin-faded" : ""}`;
        el.innerHTML = pinSvg(inc.urgency, inc.verification, categoryIconSvg(icon, 14));
        el.setAttribute("aria-label", label);
        el.title = label;
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          this.opts.onSelect(inc.id);
        });
        return el;
      },
    };
  }
}

/** Area names as HTML labels so Bangla renders properly (MapLibre can't shape Bengali). */
export class AreaLabels {
  private markers: maplibregl.Marker[] = [];
  constructor(private readonly map: MlMap) {}
  set(areas: { id: string; lat: number; lng: number; label: string }[]) {
    this.markers.forEach((m) => m.remove());
    this.markers = areas.map((a) => {
      const el = document.createElement("div");
      el.className = "area-label";
      el.textContent = a.label;
      el.setAttribute("aria-hidden", "true");
      return new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([a.lng, a.lat + 0.0042]).addTo(this.map);
    });
  }
  destroy() {
    this.markers.forEach((m) => m.remove());
  }
}

/** Translucent circles for watch zones and the SOS radius. */
export function setCircleLayer(
  map: MlMap,
  id: string,
  features: GeoJSON.Feature<GeoJSON.Polygon>[],
  paint: { fill: string; fillOpacity: number; line: string; dash?: number[] },
) {
  const data: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
  const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
  if (src) {
    src.setData(data);
    return;
  }
  map.addSource(id, { type: "geojson", data });
  map.addLayer({ id: `${id}-fill`, type: "fill", source: id, paint: { "fill-color": paint.fill, "fill-opacity": paint.fillOpacity } });
  map.addLayer({
    id: `${id}-line`,
    type: "line",
    source: id,
    paint: { "line-color": paint.line, "line-width": 1.5, ...(paint.dash ? { "line-dasharray": paint.dash } : {}) },
  });
}
