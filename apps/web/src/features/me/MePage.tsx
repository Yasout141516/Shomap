import { useMemo } from "react";
import { Link, Navigate } from "react-router-dom";
import { ChevronRight, MapPin } from "lucide-react";
import { useI18n } from "../../i18n";
import { useApp } from "../../lib/appState";
import { useIncidents, useMeta, useZones } from "../../lib/queries";
import { setGuestArea, useSession } from "../../lib/session";
import { StatusTracker } from "../../ui/StatusTracker";
import { EmptyState, Skeleton } from "../../ui/states";
import { IncidentCard } from "../incident/IncidentCard";

export function MePage() {
  const { t, name, lang, setLang, n } = useI18n();
  const meta = useMeta();
  const { me, loading, updateMe, logout } = useSession();
  const incidents = useIncidents();
  const zones = useZones(!!me && me.role === "citizen");
  const { toast } = useApp();

  const mine = useMemo(() => (incidents.data ?? []).filter((i) => i.reporterIsYou), [incidents.data]);

  if (loading) return <Skeleton rows={3} />;
  if (!me)
    return (
      <div className="page">
        <EmptyState
          title={t("me.guestTitle")}
          body={t("me.guestBody")}
          action={
            <Link className="btn btn-primary btn-sm" to="/login">
              {t("common.login")}
            </Link>
          }
        />
      </div>
    );
  if (me.role === "authority") return <Navigate to="/authority" replace />;
  if (me.role === "admin") return <Navigate to="/admin" replace />;

  return (
    <div className="page">
      <header className="page-head">
        <h1>{me.displayName}</h1>
        <p className="muted">
          {t(`roles.${me.role}`)} · {me.phone}
        </p>
      </header>

      <section className="card settings">
        <div className="field">
          <span className="field-label">{t("common.language")}</span>
          <div className="seg" role="group">
            {(["en", "bn"] as const).map((l) => (
              <button
                key={l}
                className={lang === l ? "on" : ""}
                aria-pressed={lang === l}
                lang={l}
                onClick={() => {
                  setLang(l);
                  void updateMe({ lang: l });
                }}
              >
                {l === "en" ? "English" : "বাংলা"}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <span className="field-label">{t("me.homeArea")}</span>
          <select
            id="me-home-area"
            value={me.homeAreaId ?? ""}
            onChange={(e) => {
              setGuestArea(e.target.value);
              void updateMe({ homeAreaId: e.target.value }).then(() => toast(t("me.saved"), "success"));
            }}
          >
            <option value="" disabled>
              {t("me.chooseArea")}
            </option>
            {meta.data?.areas.map((a) => (
              <option key={a.id} value={a.id}>
                {name(a)}
              </option>
            ))}
          </select>
        </label>
        <Link to="/me/zones" className="settings-link">
          <MapPin size={18} aria-hidden="true" />
          <span>{t("me.zones")}</span>
          <span className="muted">{t("me.zonesCount", { count: n(zones.data?.length ?? 0) })}</span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </section>

      <section>
        <h2>{t("me.myReports")}</h2>
        {mine.length === 0 ? (
          <EmptyState title={t("me.noReports")} />
        ) : (
          <ul className="my-reports">
            {mine.map((i) => (
              <li key={i.id} className="card">
                <IncidentCard incident={i} showStatus={false} />
                <StatusTracker incident={i} compact />
              </li>
            ))}
          </ul>
        )}
      </section>

      <button className="btn btn-ghost" onClick={() => void logout()}>
        {t("common.logout")}
      </button>
    </div>
  );
}
