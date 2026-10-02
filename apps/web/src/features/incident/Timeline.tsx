import type { IncidentDetailDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { dateTime } from "../../lib/format";

/** PRD FR-5.2: every status change with who, when, and the note. */
export function Timeline({ incident }: { incident: IncidentDetailDTO }) {
  const { t, lang } = useI18n();
  return (
    <section className="timeline-wrap">
      <h3>{t("incident.history")}</h3>
      <ol className="timeline">
        {incident.events.map((e) => (
          <li key={e.id} className={`ev ev-${e.toStatus}`}>
            <span className="ev-dot" aria-hidden="true" />
            <div>
              <p className="ev-title">
                {t(`events.${e.toStatus}`)}
                <span className="muted small"> · {dateTime(e.createdAt, lang)}</span>
              </p>
              {e.actorName || e.actorRole === "system" ? (
                <p className="muted small">{e.actorRole === "system" ? t("common.system") : e.actorRole === "admin" ? t("common.moderators") : e.actorName}</p>
              ) : null}
              {e.note ? <p className="ev-note">{e.note}</p> : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
