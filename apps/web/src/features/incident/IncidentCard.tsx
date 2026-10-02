import { memo, useCallback } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, Siren } from "lucide-react";
import type { IncidentDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { useLookup } from "../../lib/lookup";
import { relTime } from "../../lib/format";
import { StatusPill, UrgencyBadge, VerificationBadge } from "../../ui/badges";
import { CategoryIcon } from "../../ui/icons";

/** Screen-reader / tooltip label for a pin: "High, Mugging, Verified, Farmgate, 20 minutes ago". */
export function useIncidentLabel() {
  const { t, name, lang } = useI18n();
  const lookup = useLookup();
  return useCallback(
    (inc: IncidentDTO) => {
      const v = inc.verification === "verified" ? t("verification.verifiedShort") : t(`verification.${inc.verification}`);
      return [t(`urgency.${inc.urgency}`), name(lookup.category(inc.categoryId)), v, name(lookup.area(inc.areaId)), relTime(inc.createdAt, lang)].join(", ");
    },
    [t, name, lang, lookup],
  );
}

/** A row in the map list and the feed. Hierarchy: category + urgency, then place/time, then trust/status. */
export const IncidentCard = memo(function IncidentCard({ incident, selected = false, showStatus = true }: { incident: IncidentDTO; selected?: boolean; showStatus?: boolean }) {
  const { t, name, lang, n } = useI18n();
  const lookup = useLookup();
  const cat = lookup.category(incident.categoryId);
  const sosActive = incident.sos?.state === "active";
  return (
    <Link to={`/incident/${incident.id}`} className={`incident-card${selected ? " is-selected" : ""}${sosActive ? " is-sos" : ""}`} aria-current={selected ? "true" : undefined}>
      <span className={`incident-card-icon u-${incident.urgency}`} aria-hidden="true">
        {sosActive ? <Siren size={18} /> : <CategoryIcon icon={cat?.icon ?? "circle-help"} size={18} />}
      </span>
      <span className="incident-card-body">
        <span className="incident-card-title">{sosActive ? `${t("sos.banner")}: ${incident.sos!.childName}` : name(cat)}</span>
        <span className="incident-card-meta">
          {[incident.addressText, name(lookup.area(incident.areaId))].filter(Boolean).join(", ")} · {relTime(incident.createdAt, lang)}
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
});
