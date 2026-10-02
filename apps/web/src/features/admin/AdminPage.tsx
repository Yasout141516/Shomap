import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { QUEUE_REASONS, type AdminAction, type QueueItemDTO, type QueueReason } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import { useAction } from "../../lib/actions";
import { eventLabelKey } from "../../lib/events";
import { relTime } from "../../lib/format";
import { useLookup } from "../../lib/lookup";
import { qk, useAdminQueue, useEventLog, useMeta } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { AnonymousBadge, UrgencyBadge, VerificationBadge } from "../../ui/badges";
import { NoteDialog } from "../../ui/NoteDialog";
import { EmptyState, ErrorState, Skeleton } from "../../ui/states";

export function AdminPage() {
  const { t, name, lang, n } = useI18n();
  const { me } = useSession();
  const meta = useMeta();
  const lookup = useLookup();
  const isAdmin = me?.role === "admin";
  const q = useAdminQueue(isAdmin);
  const events = useEventLog(isAdmin);
  const { run, busy } = useAction();
  const [tab, setTab] = useState<QueueReason>("sos_review");
  const [dialog, setDialog] = useState<{ item: QueueItemDTO; action: "remove" | "refer" } | null>(null);
  const [authorityId, setAuthorityId] = useState("");

  const counts = useMemo(() => {
    const c = new Map<QueueReason, number>();
    for (const i of q.data ?? []) c.set(i.reason, (c.get(i.reason) ?? 0) + 1);
    return c;
  }, [q.data]);

  if (!isAdmin)
    return (
      <div className="page">
        <EmptyState title={t("admin.notAdmin")} />
      </div>
    );

  const act = (incidentId: string, action: AdminAction, extra: { note?: string; authorityId?: string } = {}) =>
    void run(() => api(`/api/admin/incidents/${incidentId}/actions`, { body: { action, ...extra } }), { invalidate: [qk.adminQueue, qk.events] });

  const items = (q.data ?? []).filter((i) => i.reason === tab);

  return (
    <div className="page page-wide admin-page">
      <header className="page-head">
        <h1>{t("admin.title")}</h1>
      </header>
      <div className="admin-layout">
        <section>
          <div className="tabs" role="tablist">
            {QUEUE_REASONS.map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                {t(`admin.tabs.${k}`)} {counts.get(k) ? <span className="count-badge">{n(counts.get(k)!)}</span> : null}
              </button>
            ))}
          </div>
          {q.isLoading ? (
            <Skeleton rows={4} height={72} />
          ) : q.isError ? (
            <ErrorState message={t("authority.error")} error={q.error} onRetry={() => void q.refetch()} />
          ) : items.length === 0 ? (
            <EmptyState title={t("admin.empty")} />
          ) : (
            <ul className="review-list">
              {items.map((item) => {
                const inc = item.incident;
                return (
                  <li key={`${item.reason}-${inc.id}`} className="card review-item">
                    <div className="review-main">
                      <Link to={`/incident/${inc.id}`} className="queue-title">
                        {inc.sos ? `${t("sos.banner")}: ${inc.sos.childName}, ${inc.sos.childAge}` : name(lookup.category(inc.categoryId))}
                      </Link>
                      <p className="muted small">
                        {name(lookup.area(inc.areaId))} · {relTime(inc.createdAt, lang)} · {t("authority.reporter")}: {inc.reporter?.displayName ?? "?"}
                      </p>
                      {inc.isAnonymous ? <AnonymousBadge label={t("incident.anonymousToPublic")} /> : null}
                      <p className="small">{inc.description}</p>
                      <div className="badge-row">
                        <UrgencyBadge urgency={inc.urgency} />
                        <VerificationBadge incident={inc} />
                        {item.flagCount ? <span className="badge badge-disputed">{t("admin.flags", { count: item.flagCount })}</span> : null}
                      </div>
                      {item.note ? <p className="note small">{item.note}</p> : null}
                    </div>
                    <div className="review-actions">
                      {item.reason === "sos_review" ? (
                        <>
                          <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(inc.id, "clear_review")}>
                            {t("admin.approve")}
                          </button>
                          <button className="btn btn-sos btn-sm" disabled={busy} onClick={() => act(inc.id, "retract_sos")}>
                            {t("admin.retract")}
                          </button>
                        </>
                      ) : null}
                      {item.reason === "disputed" || item.reason === "flagged" ? (
                        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act(inc.id, "verify")}>
                          {t("admin.verify")}
                        </button>
                      ) : null}
                      {item.reason === "redirected" ? (
                        <button className="btn btn-primary btn-sm" onClick={() => setDialog({ item, action: "refer" })}>
                          {t("admin.refer")}
                        </button>
                      ) : null}
                      {item.reason === "flagged" ? (
                        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => act(inc.id, "dismiss_flags")}>
                          {t("admin.dismissFlags")}
                        </button>
                      ) : null}
                      <button className="btn btn-ghost btn-sm" onClick={() => setDialog({ item, action: "remove" })}>
                        {t("admin.remove")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="card event-log" aria-live="polite">
          <h2>{t("admin.events")}</h2>
          {events.data?.length ? (
            <ol>
              {events.data.map((e) => (
                <li key={e.id}>
                  <Link to={`/incident/${e.incidentId}`}>{t(eventLabelKey(e))}</Link>
                  <span className="muted small">
                    {" "}
                    · {e.actorName ?? t("common.system")} · {relTime(e.createdAt, lang)}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{t("admin.noEvents")}</p>
          )}
        </aside>
      </div>

      {dialog?.action === "remove" ? (
        <NoteDialog title={t("admin.remove")} label={t("admin.removeReason")} onConfirm={(note) => act(dialog.item.incident.id, "remove", { note })} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.action === "refer" ? (
        <NoteDialog
          title={t("admin.refer")}
          label=""
          required={false}
          canConfirm={!!authorityId}
          onConfirm={() => act(dialog.item.incident.id, "refer", { authorityId })}
          onClose={() => {
            setDialog(null);
            setAuthorityId("");
          }}
        >
          <label className="field">
            <span className="field-label">{t("admin.referTo")}</span>
            <select id="admin-refer-to" value={authorityId} onChange={(e) => setAuthorityId(e.target.value)}>
              <option value="" disabled>
                …
              </option>
              {meta.data?.authorities.map((a) => (
                <option key={a.id} value={a.id}>
                  {name(a)}
                </option>
              ))}
            </select>
          </label>
        </NoteDialog>
      ) : null}
    </div>
  );
}
