import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { IncidentDTO, IncidentDetailDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import { useAction } from "../../lib/actions";
import { useToast } from "../../lib/appState";
import { qk, useMeta } from "../../lib/queries";
import { upsertIncident } from "../../lib/realtime";
import { useSession } from "../../lib/session";

/** PRD §12.4 "Seen this too?" — one tap each; disabled states always explain themselves. */
export function VoteBox({ incident }: { incident: IncidentDetailDTO }) {
  const { t } = useI18n();
  const { me } = useSession();
  const meta = useMeta();
  const qc = useQueryClient();
  const { run, busy } = useAction();
  const { toast } = useToast();

  /** POSTs return the updated incident: put it in the list now; the detail (with timeline) refetches. */
  const act = (path: string, body?: unknown, success?: string) =>
    run(
      async () => {
        const r = await api<{ incident: IncidentDTO | null; neighbour?: string }>(path, body ? { body } : { method: "POST" });
        if (r.incident) upsertIncident(qc, r.incident);
        return r;
      },
      { success, invalidate: [qk.incident(incident.id)] },
    );

  if (incident.status === "closed" || (incident.sos && incident.status !== "resolved")) return null;

  if (incident.status === "resolved") {
    const needed = meta.data?.config.reopenThreshold ?? 3;
    return (
      <section className="vote-box" aria-label={t("incident.stillHappening")}>
        <p className="vote-q">{t("incident.stillHappening")}?</p>
        <p className="muted small">{t("incident.stillHappeningHelp", { count: incident.stillHappeningCount, needed })}</p>
        {me?.role === "citizen" ? (
          <button className="btn btn-secondary" disabled={busy || incident.myStillHappening} onClick={() => void act(`/api/incidents/${incident.id}/still-happening`, undefined, t("incident.stillSent"))}>
            {incident.myStillHappening ? t("incident.stillSent") : t("incident.stillHappening")}
          </button>
        ) : null}
      </section>
    );
  }

  let body;
  if (!me) {
    body = (
      <Link to="/login" className="btn btn-secondary btn-block">
        {t("incident.loginToVote")}
      </Link>
    );
  } else if (me.role !== "citizen") {
    body = <p className="muted small">{t("incident.staffNoVote")}</p>;
  } else if (incident.reporterIsYou) {
    body = <p className="note">{t("incident.youReported")}</p>;
  } else if (incident.myVote) {
    body = <p className="note note-ok">{t(incident.myVote === "confirm" ? "incident.youConfirmed" : "incident.youDisputed")}</p>;
  } else {
    body = (
      <div className="vote-buttons">
        <button className="btn btn-primary" disabled={busy} onClick={() => void act(`/api/incidents/${incident.id}/votes`, { vote: "confirm" })}>
          {t("incident.confirm")}
        </button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void act(`/api/incidents/${incident.id}/votes`, { vote: "dispute" })}>
          {t("incident.dispute")}
        </button>
      </div>
    );
  }

  return (
    <section className="vote-box" aria-label={t("incident.seenThis")}>
      <p className="vote-q">{t("incident.seenThis")}</p>
      {body}
      <p className="muted small">
        {t("incident.confirms", { count: incident.confirmCount })} · {t("incident.disputes", { count: incident.disputeCount })}
      </p>
      {meta.data?.demoMode && me && incident.verification !== "verified" ? (
        <button
          className="link-like small"
          disabled={busy}
          onClick={() =>
            void run(
              async () => {
                const r = await api<{ neighbour: string }>("/api/demo/neighbour-confirm", { body: { incidentId: incident.id } });
                toast(t("incident.demoConfirmed", { name: r.neighbour }), "success");
              },
              { invalidate: [qk.incident(incident.id)] },
            )
          }
        >
          {t("incident.demoConfirm")}
        </button>
      ) : null}
    </section>
  );
}
