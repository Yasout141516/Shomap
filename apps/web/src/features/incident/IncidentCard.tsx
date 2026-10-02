import { Link } from "react-router-dom";
import { MessageCircle, Siren } from "lucide-react";
import type { IncidentDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { useMeta } from "../../lib/queries";
import { relTime } from "../../lib/format";
import { StatusPill, UrgencyBadge, VerificationBadge } from "../../ui/badges";
import { CategoryIcon } from "../../ui/icons";

export function useIncidentLabel() {
  const { t, name, lang } = useI18n();
  const meta = useMeta();
  return (inc: IncidentDTO) => {
    const cat = meta.data?.categories.find((c) => c.id === inc.categoryId);
    const area = meta.data?.areas.find((a) => a.id === inc.areaId);
    const v = inc.verification === "verified" ? t("verification.verifiedShort") : t(`verification.${inc.verification}`);
    return [t(`urgency.${inc.urgency}`), name(cat), v, name(area), relTime(inc.createdAt, lang)].join(", ");
  };
}

/** A row in the map list and the feed. Hierarchy: category + urgency, then place/time, then trust/status. */
export function IncidentCard({ incident, selected = false, showStatus = true }: { incident: IncidentDTO; selected?: boolean; showStatus?: boolean }) {
  const { t, name, lang, n } = useI18n();
  const meta = useMeta();
  const cat = meta.data?.categories.find((c) => c.id === incident.categoryId);
  const area = meta.data?.areas.find((a) => a.id === incident.areaId);
  const sosActive = incident.sos?.state === "active";
  return (
    <Link to={`/incident/${incident.id}`} className={`incident-card${selected ? " is-selected" : ""}${sosActive ? " is-sos" : ""}`} aria-current={selected ? "true" : undefined}>
      <span className={`incident-card-icon u-${incident.urgency}`} aria-hidden="true">
        {sosActive ? <Siren size={18} /> : <CategoryIcon icon={cat?.icon ?? "circle-help"} size={18} />}
      </span>
      <span className="incident-card-body">
        <span className="incident-card-title">
          {sosActive ? `${t("sos.banner")}: ${incident.sos!.childName}` : name(cat)}
        </span>
        <span className="incident-card-meta">
          {[incident.addressText, name(area)].filter(Boolean).join(", ")} · {relTime(incident.createdAt, lang)}
        </span>
        <span className="incident-card-badges">
          <UrgencyBadge urgency={incident.urgency} />
          <VerificationBadge incident={incident} />
          {showStatus && incident.status !== "open" ? <StatusPill status={incident.status} /> : null}
          {incident.commentCount ? (
            <span className="muted small inline-icon">
              <MessageCircle size={13} aria-hidden="true" /> {n(incident.commentCount)}
            </span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
