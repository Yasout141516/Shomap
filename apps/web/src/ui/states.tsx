import type { ReactNode } from "react";
import { WifiOff } from "lucide-react";
import { useI18n } from "../i18n";
import { errorText } from "../lib/api";

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <p className="empty-title">{title}</p>
      {body ? <p className="empty-body">{body}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, error, onRetry }: { message: string; error?: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  const detail = error ? errorText(error, t) : null;
  return (
    <div className="error-state" role="alert">
      <WifiOff size={18} aria-hidden="true" />
      <div>
        <p>{message}</p>
        {detail && detail !== message ? <p className="muted small">{detail}</p> : null}
      </div>
      {onRetry ? (
        <button className="btn btn-secondary btn-sm" onClick={onRetry}>
          {t("common.retry")}
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ rows = 5, height = 64 }: { rows?: number; height?: number }) {
  return (
    <div className="skeleton-list" aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height }} />
      ))}
    </div>
  );
}
