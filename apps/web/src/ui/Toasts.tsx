import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";
import { useToast } from "../lib/appState";
import { useI18n } from "../i18n";

export function Toasts() {
  const { toasts, dismissToast } = useToast();
  const nav = useNavigate();
  const { t } = useI18n();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.tone}`}>
          {toast.href ? (
            <button
              className="toast-text link-like"
              onClick={() => {
                nav(toast.href!);
                dismissToast(toast.id);
              }}
            >
              {toast.text}
            </button>
          ) : (
            <span className="toast-text">{toast.text}</span>
          )}
          <button className="icon-btn" onClick={() => dismissToast(toast.id)} aria-label={t("common.close")}>
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
