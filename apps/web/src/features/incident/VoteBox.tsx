import { useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { IncidentDetailDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { api, errorText } from "../../lib/api";
import { useApp } from "../../lib/appState";
import { qk, useMeta } from "../../lib/queries";
import { useSession } from "../../lib/session";

/** PRD §12.4 "Seen this too?" — one tap each; disabled states always explain themselves. */
export function VoteBox({ incident }: { incident: IncidentDetailDTO }) {
  const { t } = useI18n();
  const { me } = useSession();
  const meta = useMeta();
  const { toast } = useApp();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const needed = meta.data?.config.confirmThreshold ?? 3;
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.incident(incident.id) });
    void qc.invalidateQueries({ queryKey: qk.incidents });
  };

  const run = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok, "success");
      refresh();
    } catch (e) {
      toast(errorText(e, t), "error");
      refresh();
    } finally {
      setBusy(false);
    }
  };
  const vote = (v: "confirm" | "dispute") => run(() => api(`/api/incidents/${incident.id}/votes`, { body: { vote: v } }));

  const resolved = incident.status === "resolved";
  const counts = (
    <p className="muted small">
      {t("incident.confirms", { count: incident.confirmCount })} · {t("incident.disputes", { count: incident.disputeCount })}
    </p>
  );

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
        <button className="btn btn-primary" disabled={busy} onClick={() => void vote("confirm")}>
          {t("incident.confirm")}
        </button>
        <button className="btn btn-secondary" disabled={busy} onClick={() => void vote("dispute")}>
          {t("incident.dispute")}
        </button>
      </div>
    );
  }

  return (
    <section className="vote-box" aria-label={t("incident.seenThis")}>
      {resolved ? (
        <>
          <p className="vote-q">{t("incident.stillHappening")}?</p>
          <p className="muted small">{t("incident.stillHappeningHelp", { count: incident.stillHappeningCount, needed })}</p>
          {me?.role === "citizen" ? (
            <button
              className="btn btn-secondary"
              disabled={busy || incident.myStillHappening}
              title={incident.myStillHappening ? t("incident.stillSent") : undefined}
              onClick={() => void run(() => api(`/api/incidents/${incident.id}/still-happening`, { method: "POST" }), t("incident.stillSent"))}
            >
              {incident.myStillHappening ? t("incident.stillSent") : t("incident.stillHappening")}
            </button>
          ) : null}
        </>
      ) : incident.status === "closed" || incident.sos ? null : (
        <>
          <p className="vote-q">{t("incident.seenThis")}</p>
          {body}
          {counts}
          {meta.data?.demoMode && me && incident.verification !== "verified" ? (
            <button
              className="link-like small"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const r = await api<{ neighbour: string }>("/api/demo/neighbour-confirm", { body: { incidentId: incident.id } });
                  toast(t("incident.demoConfirmed", { name: r.neighbour }), "success");
                })
              }
            >
              {t("incident.demoConfirm")}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
