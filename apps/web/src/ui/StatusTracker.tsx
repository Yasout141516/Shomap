import { Check } from "lucide-react";
import type { IncidentDTO } from "@shomap/shared";
import { useI18n } from "../i18n";

/** PRD §12.4: Reported ✓ → Verified → Referred → Resolved. */
export function StatusTracker({ incident, compact = false }: { incident: Pick<IncidentDTO, "status" | "verification" | "referral" | "urgency">; compact?: boolean }) {
  const { t } = useI18n();
  const referred = !!incident.referral || ["referred", "acknowledged", "in_progress", "resolved", "closed"].includes(incident.status);
  const steps = [
    { key: "reported", done: true },
    { key: "verified", done: incident.verification === "verified" },
    { key: "referred", done: referred },
    { key: "resolved", done: incident.status === "resolved" || incident.status === "closed" },
  ];
  const current = steps.findIndex((s) => !s.done);
  return (
    <ol className={`tracker${compact ? " tracker-compact" : ""}`} aria-label={t("incident.history")}>
      {steps.map((s, i) => (
        <li key={s.key} className={s.done ? "done" : i === current ? "current" : ""} aria-current={i === current ? "step" : undefined}>
          <span className="tracker-dot">{s.done ? <Check size={12} strokeWidth={3} aria-hidden="true" /> : null}</span>
          <span className="tracker-label">{t(`tracker.${s.key}`)}</span>
        </li>
      ))}
    </ol>
  );
}
