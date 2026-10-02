import type { IncidentDetailDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { dateTime } from "../../lib/format";
import { eventLabelKey } from "../../lib/events";

/** PRD FR-5.2: every status, trust and SOS change with who, when, and the note. */
export function Timeline({ incident }: { incident: IncidentDetailDTO }) {
  const { t, lang } = useI18n();
  return (
    <section className="timeline-wrap">
      <h3>{t("incident.history")}</h3>
      <ol className="timeline">
        {incident.events.map((e) => {
          const who = e.actorRole === "system" ? t("common.system") : e.actorRole === "admin" ? t("common.moderators") : e.actorName;
          const note = e.noteKey ? t(`eventNotes.${e.noteKey}`, e.noteParams) : e.note;
          return (
            <li key={e.id} className={`ev ev-${e.toStatus}`}>
              <span className="ev-dot" aria-hidden="true" />
              <div>
                <p className="ev-title">
                  {t(eventLabelKey(e))}
                  <span className="muted small"> · {dateTime(e.createdAt, lang)}</span>
                </p>
                {who ? <p className="muted small">{who}</p> : null}
                {note ? <p className="ev-note">{note}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
