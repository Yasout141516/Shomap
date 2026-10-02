import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import type { IncidentDTO, ReferralAction } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { api, errorText } from "../../lib/api";
import { useApp } from "../../lib/appState";
import { duration } from "../../lib/format";
import { qk, useAuthorityQueue, useMeta } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { StatusPill, UrgencyBadge, VerificationBadge } from "../../ui/badges";
import { Modal } from "../../ui/Modal";
import { EmptyState, ErrorState, Skeleton } from "../../ui/states";

/** Ticks once a minute so "waiting" timers stay current. */
function useMinuteTick() {
  const [, set] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => set((x) => x + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
}

export function AuthorityPage() {
  const { t, name, lang } = useI18n();
  const { me } = useSession();
  const meta = useMeta();
  const q = useAuthorityQueue(me?.role === "authority");
  const qc = useQueryClient();
  const { toast } = useApp();
  const [noteFor, setNoteFor] = useState<{ inc: IncidentDTO; action: "resolve" | "redirect" } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useMinuteTick();

  if (!me || me.role !== "authority") return <div className="page"><EmptyState title={t("authority.notStaff")} /></div>;
  const authority = meta.data?.authorities.find((a) => a.id === me.authorityId);

  const act = async (inc: IncidentDTO, action: ReferralAction, withNote?: string) => {
    setBusy(inc.id);
    try {
      await api(`/api/referrals/${inc.referral!.id}/actions`, { body: { action, note: withNote } });
      void qc.invalidateQueries({ queryKey: qk.authorityQueue });
      void qc.invalidateQueries({ queryKey: qk.incident(inc.id) });
    } catch (e) {
      toast(errorText(e, t), "error");
      void qc.invalidateQueries({ queryKey: qk.authorityQueue });
    } finally {
      setBusy(null);
    }
  };

  const waiting = (inc: IncidentDTO) => {
    const r = inc.referral!;
    if (inc.status === "referred") return t("authority.awaitingAck", { time: duration(r.referredAt, lang) });
    return t("authority.since", { status: t(`status.${inc.status}`), time: duration(r.acknowledgedAt ?? r.referredAt, lang) });
  };

  return (
    <div className="page page-wide">
      <header className="page-head">
        <h1>{t("authority.title")}</h1>
        <p className="muted inline-icon">
          <ShieldCheck size={16} aria-hidden="true" /> {name(authority)} · <span className="badge badge-demo">{t("common.demoAccount")}</span>
        </p>
        <p className="note">{t("authority.notice")}</p>
      </header>

      {q.isLoading ? (
        <Skeleton rows={4} height={56} />
      ) : q.isError ? (
        <ErrorState message={t("authority.error")} error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title={t("authority.empty", { authority: name(authority) })} />
      ) : (
        <div className="table-wrap">
          <table className="queue">
            <thead>
              <tr>
                <th>{t("authority.colIncident")}</th>
                <th>{t("authority.colUrgency")}</th>
                <th>{t("authority.colStatus")}</th>
                <th>{t("authority.colWaiting")}</th>
                <th>{t("authority.colActions")}</th>
              </tr>
            </thead>
            <tbody>
              {q.data.map((inc) => {
                const cat = meta.data?.categories.find((c) => c.id === inc.categoryId);
                const area = meta.data?.areas.find((a) => a.id === inc.areaId);
                const stale = inc.status === "referred" && Date.now() - Date.parse(inc.referral!.referredAt) > 30 * 60_000;
                return (
                  <tr key={inc.id} className={`${inc.status === "resolved" ? "is-done" : ""}${inc.sos?.state === "active" ? " is-sos" : ""}`}>
                    <td>
                      <Link to={`/incident/${inc.id}`} className="queue-title">
                        {inc.sos ? `${t("sos.banner")}: ${inc.sos.childName}` : name(cat)}
                      </Link>
                      <p className="muted small">
                        {[inc.addressText, name(area)].filter(Boolean).join(", ")} · {t("authority.reporter")}: {inc.reporter?.displayName ?? t("common.anonymous")}
                        {inc.isAnonymous ? ` (${t("incident.anonymousToPublic")})` : ""}
                      </p>
                      <p className="small clamp-2">{inc.description}</p>
                    </td>
                    <td>
                      <UrgencyBadge urgency={inc.urgency} />
                      <VerificationBadge incident={inc} />
                    </td>
                    <td>
                      <StatusPill status={inc.status} />
                    </td>
                    <td className={stale ? "stale" : ""}>{inc.status === "resolved" ? t("authority.resolvedRecently") : waiting(inc)}</td>
                    <td>
                      <div className="row-gap wrap">
                        {inc.status === "referred" ? (
                          <>
                            <button className="btn btn-primary btn-sm" disabled={busy === inc.id} onClick={() => void act(inc, "acknowledge")}>
                              {t("authority.acknowledge")}
                            </button>
                            <button className="btn btn-ghost btn-sm" disabled={busy === inc.id} onClick={() => setNoteFor({ inc, action: "redirect" })}>
                              {t("authority.redirect")}
                            </button>
                          </>
                        ) : null}
                        {inc.status === "acknowledged" ? (
                          <button className="btn btn-primary btn-sm" disabled={busy === inc.id} onClick={() => void act(inc, "start")}>
                            {t("authority.start")}
                          </button>
                        ) : null}
                        {inc.status === "acknowledged" || inc.status === "in_progress" ? (
                          <button className="btn btn-secondary btn-sm" disabled={busy === inc.id} onClick={() => setNoteFor({ inc, action: "resolve" })}>
                            {t("authority.resolve")}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {noteFor ? (
        <Modal
          title={noteFor.action === "resolve" ? t("authority.resolve") : t("authority.redirect")}
          onClose={() => setNoteFor(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setNoteFor(null)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                disabled={note.trim().length < 3}
                onClick={() => {
                  void act(noteFor.inc, noteFor.action, note.trim());
                  setNoteFor(null);
                  setNote("");
                }}
              >
                {t("authority.confirm")}
              </button>
            </>
          }
        >
          <label className="field">
            <span className="field-label">{noteFor.action === "resolve" ? t("authority.resolveNote") : t("authority.redirectNote")}</span>
            <textarea id="authority-note" rows={3} value={note} maxLength={300} placeholder={noteFor.action === "resolve" ? t("authority.resolvePlaceholder") : ""} onChange={(e) => setNote(e.target.value)} />
          </label>
        </Modal>
      ) : null}
    </div>
  );
}
