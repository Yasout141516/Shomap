import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../../i18n";
import { haversineM } from "../../lib/geo";
import { relTime } from "../../lib/format";
import { useLookup } from "../../lib/lookup";
import { useIncidents, useZones } from "../../lib/queries";
import { useHomeAreaId, useSession } from "../../lib/session";
import { EmptyState, ErrorState, Skeleton } from "../../ui/states";
import { IncidentCard } from "../incident/IncidentCard";

/** PRD FR-5.6: incidents in my home area and watch zones, latest activity first. */
export function FeedPage() {
  const { t, name, lang } = useI18n();
  const lookup = useLookup();
  const { me } = useSession();
  const homeAreaId = useHomeAreaId();
  const incidents = useIncidents();
  const zones = useZones();
  const home = lookup.area(homeAreaId);
  const items = useMemo(() => {
    const zs = zones.data ?? [];
    return (incidents.data ?? [])
      .filter((i) => i.areaId === homeAreaId || zs.some((z) => haversineM(z, i) <= z.radiusM))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [incidents.data, zones.data, homeAreaId]);

  const places = [home ? name(home) : null, ...(zones.data ?? []).map((z) => z.label)].filter(Boolean).join(" · ");

  return (
    <div className="page">
      <header className="page-head">
        <h1>{t("feed.title")}</h1>
        {places ? <p className="muted">{t("feed.subtitle", { areas: places })}</p> : null}
      </header>
      {!home && !me ? (
        <EmptyState
          title={t("feed.loginTitle")}
          body={t("feed.loginBody")}
          action={
            <Link className="btn btn-primary btn-sm" to="/login">
              {t("common.login")}
            </Link>
          }
        />
      ) : incidents.isLoading ? (
        <Skeleton rows={6} height={80} />
      ) : incidents.isError ? (
        <ErrorState message={t("feed.error")} error={incidents.error} onRetry={() => void incidents.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          title={t("feed.empty")}
          body={t("feed.emptyHelp")}
          action={
            me?.role === "citizen" ? (
              <Link className="btn btn-primary btn-sm" to="/me/zones">
                {t("feed.addZone")}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="feed">
          {items.map((i) => (
            <li key={i.id}>
              <IncidentCard incident={i} />
              <p className="feed-activity muted small">
                {t("feed.updated", { time: relTime(i.updatedAt, lang) })}
                {i.commentCount ? ` · ${t("feed.comments", { count: i.commentCount })}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
