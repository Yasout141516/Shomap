import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { canTransition, type IncidentDTO, type ReferralAction, type Status } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import { useAction } from "../../lib/actions";
import { duration } from "../../lib/format";
import { serverNow } from "../../lib/clock";
import { useLookup } from "../../lib/lookup";
import { qk, useAuthorityQueue } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { StatusPill, UrgencyBadge, VerificationBadge } from "../../ui/badges";
import { NoteDialog } from "../../ui/NoteDialog";
import { EmptyState, ErrorState, Skeleton } from "../../ui/states";

/** Re-renders every 30 s so "waiting" timers stay current. */
function useTick(ms = 30_000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => set((x) => x + 1), ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

/** Buttons come from the shared state machine, so the console offers exactly what the server allows. */
const ACTIONS: { action: ReferralAction; to: Status; label: string; style: string; needsNote?: boolean }[] = [
  { action: "acknowledge", to: "acknowledged", label: "authority.acknowledge", style: "btn-primary" },
  { action: "start", to: "in_progress", label: "authority.start", style: "btn-primary" },
  { action: "resolve", to: "resolved", label: "authority.resolve", style: "btn-secondary", needsNote: true },
  { action: "redirect", to: "open", label: "authority.redirect", style: "btn-ghost", needsNote: true },
];
const STALE_MS = 30 * 60_000;

export function AuthorityPage() {
  const { t, name, lang } = useI18n();
  const { me } = useSession();
  const lookup = useLookup();
  const q = useAuthorityQueue(me?.role === "authority");
  const { run, busy } = useAction();
  const [noteFor, setNoteFor] = useState<{ inc: IncidentDTO; action: "resolve" | "redirect" } | null>(null);
  useTick();

  if (!me || me.role !== "authority")
    return (
      <div className="page">
        <EmptyState title={t("authority.notStaff")} />
      </div>
    );
  const authority = lookup.authority(me.authorityId);

  const act = (inc: IncidentDTO, action: ReferralAction, note?: string) =>
    void run(() => api(`/api/referrals/${inc.referral!.id}/actions`, { body: { action, note } }), { invalidate: [qk.authorityQueue, qk.incident(inc.id)] });

  const waiting = (inc: IncidentDTO) => {
    const r = inc.referral!;
    if (inc.status === "resolved") return t("authority.resolvedRecently");
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
                const stale = inc.status === "referred" && serverNow() - Date.parse(inc.referral!.referredAt) > STALE_MS;
                return (
                  <tr key={inc.id} className={`${inc.status === "resolved" ? "is-done" : ""}${inc.sos?.state === "active" ? " is-sos" : ""}`}>
                    <td>
                      <Link to={`/incident/${inc.id}`} className="queue-title">
                        {inc.sos ? `${t("sos.banner")}: ${inc.sos.childName}` : name(lookup.category(inc.categoryId))}
                      </Link>
                      <p className="muted small">
                        {[inc.addressText, name(lookup.area(inc.areaId))].filter(Boolean).join(", ")} · {t("authority.reporter")}: {inc.reporter?.displayName ?? t("common.anonymous")}
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
                    <td className={stale ? "stale" : ""}>{waiting(inc)}</td>
                    <td>
                      <div className="row-gap wrap">
                        {ACTIONS.filter((a) => canTransition(inc.status, a.to, "authority")).map((a) => (
                          <button
                            key={a.action}
                            className={`btn btn-sm ${a.style}`}
                            disabled={busy}
                            onClick={() => (a.needsNote ? setNoteFor({ inc, action: a.action as "resolve" | "redirect" }) : act(inc, a.action))}
                          >
                            {t(a.label)}
                          </button>
                        ))}
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
        <NoteDialog
          title={t(noteFor.action === "resolve" ? "authority.resolve" : "authority.redirect")}
          label={t(noteFor.action === "resolve" ? "authority.resolveNote" : "authority.redirectNote")}
          placeholder={noteFor.action === "resolve" ? t("authority.resolvePlaceholder") : undefined}
          onConfirm={(note) => act(noteFor.inc, noteFor.action, note)}
          onClose={() => setNoteFor(null)}
        />
      ) : null}
    </div>
  );
}
