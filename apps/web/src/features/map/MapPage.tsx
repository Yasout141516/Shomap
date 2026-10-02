import { useEffect, useMemo, useRef, useState } from "react";
import { Outlet, useMatch, useNavigate } from "react-router-dom";
import type { Map as MlMap } from "maplibre-gl";
import { useI18n } from "../../i18n";
import { useApp } from "../../lib/appState";
import { useDashboard, useIncidents, useMeta, useZones } from "../../lib/queries";
import { useHomeArea, useHomeAreaId } from "../../lib/session";
import { circlePolygon, inBounds } from "../../lib/geo";
import { EmptyState, ErrorState, Skeleton } from "../../ui/states";
import { IncidentCard, useIncidentLabel } from "../incident/IncidentCard";
import { BaseMap } from "./BaseMap";
import { FilterBar } from "./FilterBar";
import { applyFilters, byUrgencyThenRecent } from "./filters";
import { AreaLabels, PinLayer, setCircleLayer } from "./PinLayer";

export function MapPage() {
  const { t, name } = useI18n();
  const nav = useNavigate();
  const match = useMatch("/incident/:id");
  const selectedId = match?.params.id ?? null;
  const meta = useMeta();
  const incidents = useIncidents();
  const zones = useZones();
  const homeAreaId = useHomeAreaId();
  const home = useHomeArea();
  // Same numbers as the dashboard (one definition of "this week").
  const week = useDashboard(homeAreaId ? "home" : "all", homeAreaId ?? undefined).data?.totals;
  const { filters, openReport, focusRequest } = useApp();
  const labelFor = useIncidentLabel();

  const [map, setMap] = useState<MlMap | null>(null);
  const [tilesMissing, setTilesMissing] = useState(false);
  const [bounds, setBounds] = useState<[number, number, number, number] | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const pins = useRef<PinLayer | null>(null);
  const labels = useRef<AreaLabels | null>(null);

  const filtered = useMemo(() => applyFilters(incidents.data ?? [], filters), [incidents.data, filters]);
  const inView = useMemo(() => {
    return bounds ? filtered.filter((i) => inBounds(i, bounds)) : filtered;
  }, [filtered, bounds]);
  const list = useMemo(() => [...inView].sort(byUrgencyThenRecent), [inView]);


  // Pins + area labels, created once the map has loaded.
  useEffect(() => {
    if (!map || !meta.data) return;
    const iconById = new Map(meta.data.categories.map((c) => [c.id, c.icon]));
    const opts = {
      iconFor: (id: string) => iconById.get(id) ?? "circle-help",
      label: labelFor,
      clusterLabel: (count: number) => t("map.cluster", { count }),
      onSelect: (id: string) => nav(`/incident/${id}`),
    };
    if (!pins.current) pins.current = new PinLayer(map, opts);
    else pins.current.setOptions(opts);
    labels.current ??= new AreaLabels(map);
    labels.current.set(meta.data.areas.map((a) => ({ id: a.id, lat: a.lat, lng: a.lng, label: name(a) })));
  }, [map, meta.data, labelFor, t, name, nav]);

  useEffect(() => () => {
    pins.current?.destroy();
    labels.current?.destroy();
    pins.current = null;
    labels.current = null;
  }, []);

  useEffect(() => {
    if (map && pins.current) pins.current.setData(filtered);
  }, [map, filtered, meta.data]);

  useEffect(() => pins.current?.setSelected(selectedId), [selectedId, map, filtered]);

  // Watch zones and active SOS radii (PRD FR-4.7, FR-8).
  useEffect(() => {
    if (!map) return;
    const draw = () => {
      setCircleLayer(map, "zones", (zones.data ?? []).map((z) => circlePolygon(z, z.radiusM)), { fill: "#006A4E", fillOpacity: 0.07, line: "#006A4E", dash: [2, 2] });
      setCircleLayer(
        map,
        "sos-radius",
        (incidents.data ?? []).filter((i) => i.sos?.state === "active").map((i) => circlePolygon(i.sos!, i.sos!.radiusM)),
        { fill: "#F42A41", fillOpacity: 0.06, line: "#F42A41" },
      );
    };
    if (map.isStyleLoaded()) draw();
    else map.once("idle", draw);
  }, [map, zones.data, incidents.data]);

  // Keep the list in sync with what's on screen.
  useEffect(() => {
    if (!map) return;
    const update = () => {
      const b = map.getBounds();
      setBounds([b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]);
    };
    update();
    map.on("moveend", update);
    return () => void map.off("moveend", update);
  }, [map]);

  useEffect(() => {
    if (map && focusRequest) map.flyTo({ center: [focusRequest.lng, focusRequest.lat], zoom: focusRequest.zoom ?? map.getZoom() });
  }, [map, focusRequest]);

  const selected = selectedId ? incidents.data?.find((i) => i.id === selectedId) : undefined;
  useEffect(() => {
    if (!map || !selected) return;
    const wide = window.innerWidth >= 1024;
    map.easeTo({ center: [selected.lng, selected.lat], zoom: Math.max(map.getZoom(), 14.5), padding: wide ? { right: 480, left: 0, top: 0, bottom: 0 } : { bottom: 0, top: 0, left: 0, right: 0 } });
    // Only when the selection changes, not on every live update of it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, selectedId, !!selected]);

  const areaName = homeAreaId && home ? name(home) : t("dashboard.scopeAll");

  return (
    <div className={`map-page${selectedId ? " has-panel" : ""}`}>
      <aside className={`list-panel${sheetOpen ? " sheet-open" : ""}`} aria-label={t("map.listTitle")}>
        <button className="sheet-handle" onClick={() => setSheetOpen((o) => !o)} aria-expanded={sheetOpen}>
          <span className="sheet-grip" aria-hidden="true" />
          {sheetOpen ? t("map.hideList") : t("map.showList")}
        </button>
        <div className="list-head">
          <p className="headline">{t(homeAreaId ? "map.headline" : "map.headlineAll", { count: week?.reported ?? 0, area: areaName })}</p>
          <FilterBar count={filtered.length} />
        </div>
        <div className="list-body">
          {incidents.isLoading ? (
            <Skeleton rows={5} />
          ) : incidents.isError ? (
            <ErrorState message={t("map.loadError")} error={incidents.error} onRetry={() => void incidents.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState
              title={t("map.emptyTitle", { area: areaName })}
              body={t("map.emptyBody")}
              action={
                <button className="btn btn-primary btn-sm" onClick={openReport}>
                  {t("map.reportIt")}
                </button>
              }
            />
          ) : (
            <ul className="incident-list">
              {list.map((i) => (
                <li key={i.id}>
                  <IncidentCard incident={i} selected={i.id === selectedId} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className="map-wrap">
        {home ? <BaseMap center={home} zoom={14} onReady={setMap} onTilesMissing={() => setTilesMissing(true)} ariaLabel={t("nav.map")} /> : <Skeleton rows={1} height={400} />}
        {tilesMissing ? <div className="map-note">{t("map.tilesUnavailable")}</div> : null}
        {week ? (
          <div className="counts-strip" aria-live="polite">
            {t("map.counts", { reported: week.reported, high: week.highPlus, resolved: week.resolved })}
          </div>
        ) : null}
      </section>

      <Outlet />
    </div>
  );
}
