import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, Building2, MapPin, MessageCircle, ShieldCheck, Siren } from "lucide-react";
import type { NotificationDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import { relTime } from "../../lib/format";
import { useNotificationText } from "../../lib/notificationText";
import { qk, useNotifications } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { EmptyState, ErrorState, Skeleton } from "../../ui/states";

const ICON: Record<string, typeof Bell> = {
  sos: Siren,
  sos_closed: ShieldCheck,
  watch_zone: MapPin,
  status_change: Building2,
  reply: MessageCircle,
  sighting: Siren,
  referral: Building2,
};

export function AlertsPage() {
  const { t, lang } = useI18n();
  const { me } = useSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  const q = useNotifications(!!me);
  const text = useNotificationText();

  const open = async (n: NotificationDTO) => {
    if (!n.readAt) {
      await api(`/api/notifications/${n.id}/read`, { method: "POST" }).catch(() => undefined);
      void qc.invalidateQueries({ queryKey: qk.notifications });
    }
    if (n.incidentId) nav(`/incident/${n.incidentId}`);
  };
  const readAll = async () => {
    await api("/api/notifications/read-all", { method: "POST" }).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: qk.notifications });
  };

  if (!me) {
    return (
      <div className="page">
        <h1>{t("alerts.title")}</h1>
        <EmptyState
          title={t("alerts.loginBody")}
          action={
            <Link className="btn btn-primary btn-sm" to="/login">
              {t("common.login")}
            </Link>
          }
        />
      </div>
    );
  }

  const unread = q.data?.some((n) => !n.readAt);
  return (
    <div className="page">
      <header className="page-head row-between">
        <h1>{t("alerts.title")}</h1>
        {unread ? (
          <button className="btn btn-ghost btn-sm" onClick={() => void readAll()}>
            {t("alerts.markAllRead")}
          </button>
        ) : null}
      </header>
      {q.isLoading ? (
        <Skeleton rows={6} height={56} />
      ) : q.isError ? (
        <ErrorState message={t("alerts.error")} error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState title={t("alerts.empty")} />
      ) : (
        <ul className="alerts">
          {q.data.map((n) => {
            const Icon = ICON[n.type] ?? Bell;
            return (
              <li key={n.id}>
                <button className={`alert-row t-${n.type}${n.readAt ? "" : " unread"}`} onClick={() => void open(n)}>
                  <span className="alert-icon" aria-hidden="true">
                    <Icon size={18} />
                  </span>
                  <span className="alert-text">
                    <span>{text(n)}</span>
                    <span className="muted small">{relTime(n.createdAt, lang)}</span>
                  </span>
                  {!n.readAt ? <span className="unread-dot" aria-label="unread" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
