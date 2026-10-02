import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { URGENCIES, type DashboardDTO, type Urgency } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { DEFAULT_FILTERS, useApp, type Filters } from "../../lib/appState";
import { shortDate } from "../../lib/format";
import { useDashboard, useMeta, useZones } from "../../lib/queries";
import { useHomeAreaId, useSession } from "../../lib/session";
import { URGENCY_COLOR, shapeSvg } from "../../ui/pin";
import { EmptyState, ErrorState, Skeleton } from "../../ui/states";

function Trend({ data }: { data: DashboardDTO["trend"] }) {
  const { t, lang, n } = useI18n();
  const W = 640;
  const H = 180;
  const pad = { l: 28, r: 8, t: 12, b: 26 };
  const max = Math.max(1, ...data.map((d) => Math.max(d.reported, d.resolved)));
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, data.length - 1);
  const y = (v: number) => H - pad.b - (v * (H - pad.t - pad.b)) / max;
  const line = (k: "reported" | "resolved") => data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join(" ");
  const ticks = [0, Math.ceil(max / 2), max];
  return (
    <figure className="trend">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("dashboard.trend")}>
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="grid" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="axis">
              {n(v)}
            </text>
          </g>
        ))}
        <path d={`${line("reported")} L${x(data.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} className="area-reported" />
        <path d={line("reported")} className="line-reported" />
        <path d={line("resolved")} className="line-resolved" />
        {data.map((d, i) =>
          i % 3 === 0 || i === data.length - 1 ? (
            <text key={d.date} x={x(i)} y={H - 6} textAnchor="middle" className="axis">
              {shortDate(d.date, lang)}
            </text>
          ) : null,
        )}
        <circle cx={x(data.length - 1)} cy={y(data[data.length - 1].reported)} r={4} className="dot-reported" />
      </svg>
      <figcaption className="legend">
        <span className="lg lg-reported">{t("dashboard.trendReported")}</span>
        <span className="lg lg-resolved">{t("dashboard.trendResolved")}</span>
      </figcaption>
    </figure>
  );
}

export function DashboardPage() {
  const { t, name, n, lang } = useI18n();
  const nav = useNavigate();
  const meta = useMeta();
  const { me } = useSession();
  const homeAreaId = useHomeAreaId();
  const zones = useZones(!!me && me.role === "citizen");
  const { setFilters } = useApp();
  const [scope, setScope] = useState<string>(homeAreaId ? "home" : "all");
  const isZone = scope.startsWith("zone:");
  const q = useDashboard(isZone ? "zone" : scope === "home" ? "home" : "all", isZone ? scope.slice(5) : scope === "home" ? (homeAreaId ?? undefined) : undefined);
  const d = q.data;

  /** FR-7.5: numbers open the map pre-filtered. */
  const drill = (patch: Partial<Filters>) => {
    setFilters({ ...DEFAULT_FILTERS, days: 7, status: "all", areaId: scope === "home" ? homeAreaId : null, ...patch });
    nav("/");
  };
  const scopeName = d ? (d.scope === "all" ? t("dashboard.scopeAll") : d.scopeLabel[lang]) : "";
  const maxCat = Math.max(1, ...(d?.byCategory.map((c) => c.count) ?? [1]));
  const maxU = Math.max(1, ...(d ? URGENCIES.map((u) => d.byUrgency[u]) : [1]));

  return (
    <div className="page">
      <header className="page-head row-between">
        <div>
          <h1>{t("dashboard.title")}</h1>
          <p className="muted">{t("dashboard.last7")}</p>
        </div>
        <label className="field field-inline">
          <span className="field-label">{t("dashboard.scope")}</span>
          <select id="dashboard-scope" value={scope} onChange={(e) => setScope(e.target.value)}>
            {homeAreaId ? (
              <option value="home">
                {t("dashboard.scopeHome")} ({name(meta.data?.areas.find((a) => a.id === homeAreaId))})
              </option>
            ) : null}
            {(zones.data ?? []).map((z) => (
              <option key={z.id} value={`zone:${z.id}`}>
                {z.label}
              </option>
            ))}
            <option value="all">{t("dashboard.scopeAll")}</option>
          </select>
        </label>
      </header>

      {q.isLoading ? (
        <Skeleton rows={3} height={96} />
      ) : q.isError || !d ? (
        <ErrorState message={t("dashboard.error")} error={q.error} onRetry={() => void q.refetch()} />
      ) : d.totals.reported === 0 && d.totals.resolved === 0 ? (
        <EmptyState title={t("dashboard.empty", { scope: scopeName })} />
      ) : (
        <>
          <div className="stat-row">
            <button className="stat" onClick={() => drill({})}>
              <span className="stat-n">{n(d.totals.reported)}</span>
              <span className="stat-l">{t("dashboard.reported")}</span>
            </button>
            <button className="stat stat-alert" onClick={() => drill({ urgencies: ["high", "critical"] })}>
              <span className="stat-n">{n(d.totals.highPlus)}</span>
              <span className="stat-l">{t("dashboard.highPlus")}</span>
            </button>
            <button className="stat" onClick={() => drill({ verification: "verified" })}>
              <span className="stat-n">{n(d.totals.verified)}</span>
              <span className="stat-l">{t("dashboard.verified")}</span>
            </button>
            <button className="stat stat-ok" onClick={() => drill({ status: "resolved" })}>
              <span className="stat-n">{n(d.totals.resolved)}</span>
              <span className="stat-l">{t("dashboard.resolved")}</span>
            </button>
          </div>
          <p className="muted small">{t("dashboard.tapHint")}</p>

          <div className="dash-grid">
            <section className="card">
              <h2>{t("dashboard.byUrgency")}</h2>
              <ul className="bars">
                {[...URGENCIES].reverse().map((u: Urgency) => (
                  <li key={u}>
                    <button className="bar-row" onClick={() => drill({ urgencies: [u] })}>
                      <span className="bar-label">
                        <span dangerouslySetInnerHTML={{ __html: shapeSvg(u, 12) }} /> {t(`urgency.${u}`)}
                      </span>
                      <span className="bar-track">
                        <span className="bar-fill" style={{ width: `${(d.byUrgency[u] / maxU) * 100}%`, background: URGENCY_COLOR[u] }} />
                      </span>
                      <span className="bar-n">{n(d.byUrgency[u])}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card">
              <h2>{t("dashboard.byCategory")}</h2>
              <ul className="bars">
                {d.byCategory.map((c) => (
                  <li key={c.categoryId}>
                    <button className="bar-row" onClick={() => drill({ categories: [c.categoryId] })}>
                      <span className="bar-label">{name(meta.data?.categories.find((x) => x.id === c.categoryId))}</span>
                      <span className="bar-track">
                        <span className="bar-fill bar-brand" style={{ width: `${(c.count / maxCat) * 100}%` }} />
                      </span>
                      <span className="bar-n">{n(c.count)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card card-wide">
              <h2>{t("dashboard.trend")}</h2>
              {d.trend.length ? <Trend data={d.trend} /> : <p className="muted">{t("dashboard.trendUnavailable")}</p>}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
