import { URGENCIES, type Urgency, type Verification } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { DEFAULT_FILTERS, useApp, type Filters } from "../../lib/appState";
import { useMeta } from "../../lib/queries";
import { shapeSvg } from "../../ui/pin";

export function FilterBar({ count }: { count: number }) {
  const { t, name, n } = useI18n();
  const { filters, setFilters } = useApp();
  const meta = useMeta();
  const set = (patch: Partial<Filters>) => setFilters((f) => ({ ...f, ...patch }));
  const toggleUrgency = (u: Urgency) =>
    setFilters((f) => ({ ...f, urgencies: f.urgencies.includes(u) ? f.urgencies.filter((x) => x !== u) : [...f.urgencies, u] }));
  const isDefault = JSON.stringify(filters) === JSON.stringify(DEFAULT_FILTERS);

  return (
    <div className="filterbar" role="group" aria-label={t("filters.title")}>
      <div className="seg seg-sm" role="group" aria-label={t("filters.status")}>
        {(["active", "resolved", "all"] as const).map((s) => (
          <button key={s} className={filters.status === s ? "on" : ""} aria-pressed={filters.status === s} onClick={() => set({ status: s })}>
            {t(`filters.${s}`)}
          </button>
        ))}
      </div>
      <div className="seg seg-sm" role="group" aria-label={t("filters.time")}>
        {([1, 7, 14] as const).map((d) => (
          <button key={d} className={filters.days === d ? "on" : ""} aria-pressed={filters.days === d} onClick={() => set({ days: d })}>
            {t(d === 1 ? "filters.h24" : d === 7 ? "filters.d7" : "filters.d14")}
          </button>
        ))}
      </div>
      <div className="chips" role="group" aria-label={t("filters.urgency")}>
        {URGENCIES.map((u) => (
          <button key={u} className={`chip${filters.urgencies.includes(u) ? " on" : ""}`} aria-pressed={filters.urgencies.includes(u)} onClick={() => toggleUrgency(u)}>
            <span dangerouslySetInnerHTML={{ __html: shapeSvg(u, 12) }} />
            {t(`urgency.${u}`)}
          </button>
        ))}
      </div>
      <div className="filter-selects">
        <label className="sr-only" htmlFor="filter-category">
          {t("filters.category")}
        </label>
        <select
          id="filter-category"
          value={filters.categories.length === 1 ? filters.categories[0] : ""}
          onChange={(e) => set({ categories: e.target.value ? [e.target.value] : [] })}
        >
          <option value="">
            {t("filters.category")}: {t("filters.all")}
          </option>
          {meta.data?.categories
            .filter((c) => !c.isBlocked)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {name(c)}
              </option>
            ))}
        </select>
        <label className="sr-only" htmlFor="filter-verification">
          {t("filters.verification")}
        </label>
        <select id="filter-verification" value={filters.verification} onChange={(e) => set({ verification: e.target.value as Verification | "all" })}>
          <option value="all">
            {t("filters.verification")}: {t("filters.all")}
          </option>
          <option value="verified">{t("verification.verifiedShort")}</option>
          <option value="unverified">{t("verification.unverified")}</option>
          <option value="disputed">{t("verification.disputed")}</option>
        </select>
      </div>
      <div className="filter-foot">
        <span className="muted small">{t("filters.showing", { count: n(count) })}</span>
        {!isDefault ? (
          <button className="link-like small" onClick={() => setFilters(DEFAULT_FILTERS)}>
            {t("filters.clear")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
