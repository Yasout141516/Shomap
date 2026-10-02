import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import type { AdminAction, QueueItemDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { api, errorText } from "../../lib/api";
import { useApp } from "../../lib/appState";
import { relTime } from "../../lib/format";
import { qk, useAdminQueue, useEventLog, useMeta } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { AnonymousBadge, UrgencyBadge, VerificationBadge } from "../../ui/badges";
import { Modal } from "../../ui/Modal";
import { EmptyState, ErrorState, Skeleton } from "../../ui/states";

const TABS = ["sos_review", "disputed", "flagged", "redirected"] as const;
type Tab = (typeof TABS)[number];

export function AdminPage() {
  const { t, name, lang, n } = useI18n();
  const { me } = useSession();
  const meta = useMeta();
  const isAdmin = me?.role === "admin";
  const q = useAdminQueue(isAdmin);
  const events = useEventLog(isAdmin);
  const qc = useQueryClient();
  const { toast } = useApp();
  const [tab, setTab] = useState<Tab>("sos_review");
  const [dialog, setDialog] = useState<{ item: QueueItemDTO; action: "remove" | "refer" } | null>(null);
  const [note, setNote] = useState("");
  const [authorityId, setAuthorityId] = useState("");

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { sos_review: 0, disputed: 0, flagged: 0, redirected: 0 };
    for (const i of q.data ?? []) c[i.reason]++;
    return c;
  }, [q.data]);

  if (!isAdmin) return <div className="page"><EmptyState title={t("admin.notAdmin")} /></div>;

  const act = async (incidentId: string, action: AdminAction, extra: { note?: string; authorityId?: string } = {}) => {
    try {
      await api(`/api/admin/incidents/${incidentId}/actions`, { body: { action, ...extra } });
      void qc.invalidateQueries({ queryKey: qk.adminQueue });
      void qc.invalidateQueries({ queryKey: qk.events });
    } catch (e) {
      toast(errorText(e, t), "error");
    }
  };

  const items = (q.data ?? []).filter((i) => i.reason === tab);

  return (
    <div className="page page-wide admin-page">
      <header className="page-head">
        <h1>{t("admin.title")}</h1>
      </header>
      <div className="admin-layout">
        <section>
          <div className="tabs" role="tablist">
            {TABS.map((k) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                {t(`admin.tabs.${k}`)} {counts[k] ? <span className="count-badge">{n(counts[k])}</span> : null}
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
                const cat = meta.data?.categories.find((c) => c.id === inc.categoryId);
                const area = meta.data?.areas.find((a) => a.id === inc.areaId);
                return (
                  <li key={`${item.reason}-${inc.id}`} className="card review-item">
                    <div className="review-main">
                      <Link to={`/incident/${inc.id}`} className="queue-title">
                        {inc.sos ? `${t("sos.banner")}: ${inc.sos.childName}, ${inc.sos.childAge}` : name(cat)}
                      </Link>
                      <p className="muted small">
                        {name(area)} · {relTime(inc.createdAt, lang)} · {t("authority.reporter")}: {inc.reporter?.displayName ?? "?"}
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
                          <button className="btn btn-primary btn-sm" onClick={() => void act(inc.id, "clear_review")}>
                            {t("admin.approve")}
                          </button>
                          <button className="btn btn-sos btn-sm" onClick={() => void act(inc.id, "retract_sos")}>
                            {t("admin.retract")}
                          </button>
                        </>
                      ) : null}
                      {item.reason === "disputed" || item.reason === "flagged" ? (
                        <button className="btn btn-primary btn-sm" onClick={() => void act(inc.id, "verify")}>
                          {t("admin.verify")}
                        </button>
                      ) : null}
                      {item.reason === "redirected" ? (
                        <button className="btn btn-primary btn-sm" onClick={() => setDialog({ item, action: "refer" })}>
                          {t("admin.refer")}
                        </button>
                      ) : null}
                      {item.reason === "flagged" ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => void act(inc.id, "dismiss_flags")}>
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
                  <Link to={`/incident/${e.incidentId}`}>{t(`events.${e.toStatus}`)}</Link>
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

      {dialog ? (
        <Modal
          title={dialog.action === "remove" ? t("admin.remove") : t("admin.refer")}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDialog(null)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                disabled={dialog.action === "remove" ? note.trim().length < 3 : !authorityId}
                onClick={() => {
                  void act(dialog.item.incident.id, dialog.action, dialog.action === "remove" ? { note: note.trim() } : { authorityId });
                  setDialog(null);
                  setNote("");
                  setAuthorityId("");
                }}
              >
                {t("authority.confirm")}
              </button>
            </>
          }
        >
          {dialog.action === "remove" ? (
            <label className="field">
              <span className="field-label">{t("admin.removeReason")}</span>
              <textarea id="admin-remove-reason" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          ) : (
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
          )}
        </Modal>
      ) : null}
    </div>
  );
}
