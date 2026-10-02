import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, ChevronUp, Link2, Siren, X } from "lucide-react";
import type { IncidentDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { useApp } from "../../lib/appState";
import { relTime } from "../../lib/format";
import { haversineM } from "../../lib/geo";
import { useIncidents, useMeta, useNotifications, useZones } from "../../lib/queries";
import { useHomeAreaId, useSession } from "../../lib/session";

/**
 * PRD §12.4 / FR-8.3: a full-width banner for everyone inside an active alert's radius (by home
 * area or watch zone) or who was notified. It can be collapsed, not dismissed, while active.
 */
export function SosBanner() {
  const { t, name, lang } = useI18n();
  const nav = useNavigate();
  const meta = useMeta();
  const incidents = useIncidents();
  const { me } = useSession();
  const zones = useZones(!!me && me.role === "citizen");
  const notes = useNotifications(!!me);
  const homeAreaId = useHomeAreaId();
  const { toast } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [found, setFound] = useState<IncidentDTO | null>(null);
  const shown = useRef(new Set<string>());

  const relevant = useMemo(() => {
    const home = meta.data?.areas.find((a) => a.id === homeAreaId);
    const notified = new Set((notes.data ?? []).filter((n) => n.type === "sos").map((n) => n.incidentId));
    return (incidents.data ?? []).filter((i) => {
      if (i.sos?.state !== "active") return false;
      if (me?.role === "admin" || i.reporterIsYou || notified.has(i.id)) return true;
      if (home && haversineM(home, i.sos) <= i.sos.radiusM) return true;
      return (zones.data ?? []).some((z) => haversineM(z, i.sos!) < z.radiusM + i.sos!.radiusM);
    });
  }, [incidents.data, meta.data, homeAreaId, notes.data, zones.data, me]);

  // When an alert someone saw closes as found, show the "Found safe" banner.
  useEffect(() => {
    for (const i of relevant) shown.current.add(i.id);
    const justFound = (incidents.data ?? []).find((i) => shown.current.has(i.id) && i.sos?.state === "found");
    if (justFound) {
      shown.current.delete(justFound.id);
      setFound(justFound);
      const tm = window.setTimeout(() => setFound(null), 20_000);
      return () => window.clearTimeout(tm);
    }
  }, [relevant, incidents.data]);

  useEffect(() => {
    if (relevant.length) setCollapsed(false);
  }, [relevant.length]);

  if (found && !relevant.length) {
    const area = meta.data?.areas.find((a) => a.id === found.areaId);
    return (
      <div className="sos-banner sos-banner-found" role="status">
        <p>{t("sos.found", { area: name(area) })}</p>
        <button className="icon-btn" onClick={() => setFound(null)} aria-label={t("common.close")}>
          <X size={18} />
        </button>
      </div>
    );
  }
  if (!relevant.length) return null;

  const inc = relevant[0];
  const sos = inc.sos!;
  const area = meta.data?.areas.find((a) => a.id === inc.areaId);
  const photo = inc.media[0]?.url;

  const copy = async () => {
    const url = `${window.location.origin}/incident/${inc.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(t("common.copied"), "success");
    } catch {
      toast(`${t("common.copyFailed")} ${url}`, "info");
    }
  };

  return (
    <section className={`sos-banner${collapsed ? " is-collapsed" : ""}`} role="alert" aria-label={t("sos.banner")}>
      {collapsed ? (
        <button className="sos-collapsed" onClick={() => setCollapsed(false)}>
          <Siren size={16} aria-hidden="true" /> {t("sos.banner")}: {sos.childName} · {name(area)}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      ) : (
        <>
          {photo ? <img className="sos-photo" src={photo} alt="" /> : null}
          <div className="sos-info">
            <p className="sos-kicker">
              <Siren size={16} aria-hidden="true" /> {t("sos.banner")}
              {relevant.length > 1 ? <span className="sos-more"> · {t("sos.more", { count: relevant.length - 1 })}</span> : null}
            </p>
            <p className="sos-title">
              {sos.childName}, {t("sos.age", { age: sos.childAge })}
            </p>
            <p>{t("sos.lastSeen", { time: relTime(sos.lastSeenAt, lang), area: name(area) })}</p>
            <p className="sos-wearing">{t("sos.wearing", { clothing: sos.clothing })}</p>
          </div>
          <div className="sos-actions">
            <button className="btn btn-light" onClick={() => nav(`/incident/${inc.id}`)}>
              {t("sos.iSaw")}
            </button>
            <button className="btn btn-outline-light" onClick={() => void copy()}>
              <Link2 size={16} aria-hidden="true" /> {t("sos.share")}
            </button>
            <button className="icon-btn icon-btn-light" onClick={() => setCollapsed(true)} aria-label={t("sos.collapse")}>
              <ChevronUp size={18} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
