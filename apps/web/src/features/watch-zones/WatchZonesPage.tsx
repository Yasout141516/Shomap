import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import { Trash2 } from "lucide-react";
import { URGENCIES, WATCH_RADII, type Urgency } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { api, errorText } from "../../lib/api";
import { useApp } from "../../lib/appState";
import { circlePolygon } from "../../lib/geo";
import { qk, useMeta, useZones } from "../../lib/queries";
import { useHomeAreaId, useSession } from "../../lib/session";
import { EmptyState, ErrorState, Skeleton } from "../../ui/states";
import { BaseMap } from "../map/BaseMap";
import { setCircleLayer } from "../map/PinLayer";

/** PRD FR-10: up to 5 zones, each a centre + radius + minimum urgency. */
export function WatchZonesPage() {
  const { t, n } = useI18n();
  const meta = useMeta();
  const { me } = useSession();
  const homeAreaId = useHomeAreaId();
  const zones = useZones(!!me);
  const qc = useQueryClient();
  const { toast } = useApp();
  const home = meta.data?.areas.find((a) => a.id === homeAreaId) ?? meta.data?.areas[0];

  const [map, setMap] = useState<MlMap | null>(null);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [label, setLabel] = useState("");
  const [radius, setRadius] = useState<number>(1000);
  const [minUrgency, setMinUrgency] = useState<Urgency>("high");
  const [busy, setBusy] = useState(false);
  const marker = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    if (!map) return;
    const onClick = (e: maplibregl.MapMouseEvent) => setCenter({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    map.on("click", onClick);
    return () => void map.off("click", onClick);
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const existing = (zones.data ?? []).map((z) => circlePolygon(z, z.radiusM));
    setCircleLayer(map, "zones", existing, { fill: "#006A4E", fillOpacity: 0.08, line: "#006A4E", dash: [2, 2] });
    setCircleLayer(map, "draft", center ? [circlePolygon(center, radius)] : [], { fill: "#1E4E8C", fillOpacity: 0.12, line: "#1E4E8C" });
    if (center) {
      marker.current ??= new maplibregl.Marker({ color: "#1E4E8C" }).setLngLat([center.lng, center.lat]).addTo(map);
      marker.current.setLngLat([center.lng, center.lat]);
    }
  }, [map, zones.data, center, radius]);

  if (!me) {
    return (
      <div className="page">
        <EmptyState title={t("me.guestTitle")} action={<Link className="btn btn-primary btn-sm" to="/login">{t("common.login")}</Link>} />
      </div>
    );
  }

  const full = (zones.data?.length ?? 0) >= 5;
  const save = async () => {
    if (!center || !label.trim()) return;
    setBusy(true);
    try {
      await api("/api/watch-zones", { body: { label: label.trim(), lat: center.lat, lng: center.lng, radiusM: radius, minUrgency } });
      toast(t("zones.saved", { label: label.trim() }), "success");
      setLabel("");
      setCenter(null);
      marker.current?.remove();
      marker.current = null;
      void qc.invalidateQueries({ queryKey: qk.zones });
    } catch (e) {
      toast(errorText(e, t), "error");
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string, zoneLabel: string) => {
    try {
      await api(`/api/watch-zones/${id}`, { method: "DELETE" });
      toast(t("zones.deleted", { label: zoneLabel }), "info");
      void qc.invalidateQueries({ queryKey: qk.zones });
    } catch (e) {
      toast(errorText(e, t), "error");
    }
  };
  const radiusLabel = (r: number) => (r >= 1000 ? t("units.km", { n: n(r / 1000) }) : t("units.m", { n: n(r) }));

  return (
    <div className="page page-wide zones-page">
      <header className="page-head">
        <h1>{t("zones.title")}</h1>
        <p className="muted">{t("zones.empty")}</p>
      </header>
      <div className="zones-layout">
        <div className="zones-side">
          {zones.isLoading ? (
            <Skeleton rows={2} />
          ) : zones.isError ? (
            <ErrorState message={t("zones.error")} onRetry={() => void zones.refetch()} />
          ) : (
            <ul className="zone-list">
              {(zones.data ?? []).map((z) => (
                <li key={z.id} className="card zone-item">
                  <div>
                    <strong>{z.label}</strong>
                    <p className="muted small">
                      {radiusLabel(z.radiusM)} · {t("zones.andAbove", { level: t(`urgency.${z.minUrgency}`) })}
                    </p>
                  </div>
                  <button className="icon-btn" onClick={() => void remove(z.id, z.label)} aria-label={`${t("zones.delete")}: ${z.label}`}>
                    <Trash2 size={18} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="card form"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <h2>{t("zones.add")}</h2>
            {full ? <p className="note">{t("zones.limit")}</p> : null}
            <label className="field">
              <span className="field-label">{t("zones.label")}</span>
              <input id="zone-label" value={label} maxLength={30} placeholder={t("zones.labelPlaceholder")} onChange={(e) => setLabel(e.target.value)} />
            </label>
            <div className="field">
              <span className="field-label">{t("zones.radius")}</span>
              <div className="seg" role="group">
                {WATCH_RADII.map((r) => (
                  <button type="button" key={r} className={radius === r ? "on" : ""} aria-pressed={radius === r} onClick={() => setRadius(r)}>
                    {radiusLabel(r)}
                  </button>
                ))}
              </div>
            </div>
            <label className="field">
              <span className="field-label">{t("zones.minUrgency")}</span>
              <select id="zone-min-urgency" value={minUrgency} onChange={(e) => setMinUrgency(e.target.value as Urgency)}>
                {URGENCIES.map((u) => (
                  <option key={u} value={u}>
                    {t("zones.andAbove", { level: t(`urgency.${u}`) })}
                  </option>
                ))}
              </select>
            </label>
            <p className={center ? "muted small" : "note"}>{center ? `${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}` : t("zones.tapMap")}</p>
            <button className="btn btn-primary" disabled={busy || full || !center || !label.trim()}>
              {t("common.save")}
            </button>
          </form>
        </div>
        {home ? <BaseMap center={home} zoom={13} onReady={setMap} className="zones-map" ariaLabel={t("zones.title")} /> : null}
      </div>
    </div>
  );
}
