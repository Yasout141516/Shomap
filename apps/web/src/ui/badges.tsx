import type { IncidentDTO, Status, Urgency } from "@shomap/shared";
import { CircleCheck, EyeOff, TriangleAlert } from "lucide-react";
import { useI18n } from "../i18n";
import { shapeSvg } from "./pin";

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  const { t } = useI18n();
  return (
    <span className={`badge badge-urgency u-${urgency}`}>
      <span className="badge-shape" dangerouslySetInnerHTML={{ __html: shapeSvg(urgency, 12) }} />
      {t(`urgency.${urgency}`)}
    </span>
  );
}

export function VerificationBadge({ incident }: { incident: Pick<IncidentDTO, "verification" | "confirmCount"> }) {
  const { t } = useI18n();
  if (incident.verification === "verified")
    return (
      <span className="badge badge-verified">
        <CircleCheck size={13} aria-hidden="true" />
        {t("verification.verified", { count: incident.confirmCount })}
      </span>
    );
  if (incident.verification === "disputed")
    return (
      <span className="badge badge-disputed">
        <TriangleAlert size={13} aria-hidden="true" />
        {t("verification.disputed")}
      </span>
    );
  return <span className="badge badge-unverified">{t("verification.unverified")}</span>;
}

export function StatusPill({ status }: { status: Status }) {
  const { t } = useI18n();
  return <span className={`badge badge-status s-${status}`}>{t(`status.${status}`)}</span>;
}

export function AnonymousBadge({ label }: { label: string }) {
  return (
    <span className="badge badge-anon">
      <EyeOff size={13} aria-hidden="true" />
      {label}
    </span>
  );
}
