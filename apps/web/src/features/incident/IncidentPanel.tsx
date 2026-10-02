import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Flag, Link2, MapPin, Siren, X } from "lucide-react";
import { FLAG_REASONS, type IncidentDetailDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { api } from "../../lib/api";
import { useAction, useCopyIncidentLink } from "../../lib/actions";
import { dateTime, identityLabel, relTime } from "../../lib/format";
import { useLookup } from "../../lib/lookup";
import { qk, useIncident } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { AnonymousBadge, StatusPill, UrgencyBadge, VerificationBadge } from "../../ui/badges";
import { CategoryIcon } from "../../ui/icons";
import { StatusTracker } from "../../ui/StatusTracker";
import { ErrorState, Skeleton } from "../../ui/states";
import { Thread } from "./Thread";
import { VoteBox } from "./VoteBox";
import { Timeline } from "./Timeline";

function FlagButton({ incidentId }: { incidentId: string }) {
  const { t } = useI18n();
  const { run } = useAction();
  const [open, setOpen] = useState(false);
  const send = (reason: string) => {
    setOpen(false);
    void run(() => api("/api/flags", { body: { targetType: "incident", targetId: incidentId, reason } }), { success: t("incident.flagged") });
  };
  return (
    <div className="flag-wrap">
      <button className="btn btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Flag size={15} aria-hidden="true" />
        {t("incident.flag")}
      </button>
      {open ? (
        <div className="menu menu-up" role="menu" aria-label={t("incident.flagReason")}>
          {FLAG_REASONS.map((r) => (
            <button key={r} role="menuitem" onClick={() => send(r)}>
              {t(`flagReason.${r}`)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function SosSection({ incident }: { incident: IncidentDetailDTO }) {
  const { t, name, lang } = useI18n();
  const lookup = useLookup();
  const { me } = useSession();
  const { run, busy } = useAction();
  const sos = incident.sos!;
  const areaName = name(lookup.area(incident.areaId));
  const canClose = sos.state === "active" && (incident.reporterIsYou || me?.role === "admin");
  const close = (state: "found" | "cancel") => void run(() => api(`/api/sos/${sos.id}/${state}`, { method: "POST" }), { invalidate: [qk.incident(incident.id)] });
  return (
    <section className={`sos-detail sos-${sos.state}`} aria-label={t("sos.banner")}>
      <p className="sos-detail-title">
        <Siren size={16} aria-hidden="true" /> {t("sos.banner")}
        {sos.pendingReview ? <span className="badge badge-unverified">{t("sos.pendingReview")}</span> : null}
      </p>
      <p className="sos-name">
        {sos.childName}, {t("sos.age", { age: sos.childAge })}
      </p>
      <p>{t("sos.wearing", { clothing: sos.clothing })}</p>
      <p className="muted">{t("sos.lastSeen", { time: relTime(sos.lastSeenAt, lang), area: areaName })}</p>
      {sos.state === "found" ? <p className="sos-found">{t("sos.found", { area: areaName })}</p> : null}
      {sos.state === "cancelled" ? <p className="muted">{t("sos.cancelled")}</p> : null}
      {sos.state === "expired" ? <p className="muted">{t("sos.expired")}</p> : null}
      {canClose ? (
        <div className="row-gap">
          <button className="btn btn-primary" disabled={busy} onClick={() => close("found")}>
            {t("incident.markFound")}
          </button>
          <button className="btn btn-ghost" disabled={busy} onClick={() => close("cancel")}>
            {t("incident.cancelAlert")}
          </button>
        </div>
      ) : null}
    </section>
  );
}

export function IncidentPanel() {
  const { id } = useParams<{ id: string }>();
  const { t, name, lang } = useI18n();
  const nav = useNavigate();
  const lookup = useLookup();
  const q = useIncident(id);
  const copyLink = useCopyIncidentLink();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, [id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && nav("/");
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav]);

  const close = (
    <button className="icon-btn panel-close" onClick={() => nav("/")} aria-label={t("incident.close")}>
      <X size={20} />
    </button>
  );

  if (q.isLoading || q.isError || !q.data) {
    return (
      <aside className="incident-panel" ref={ref} tabIndex={-1}>
        {close}
        {q.isLoading ? (
          <>
            <Skeleton rows={1} height={90} />
            <Skeleton rows={3} height={48} />
          </>
        ) : (
          <>
            <ErrorState message={t("incident.notFound")} />
            <button className="btn btn-secondary" onClick={() => nav("/")}>
              {t("incident.backToMap")}
            </button>
          </>
        )}
      </aside>
    );
  }

  const inc = q.data;
  const cat = lookup.category(inc.categoryId);
  const authority = lookup.authority(inc.referral?.authorityId);

  return (
    <aside className={`incident-panel${inc.sos ? " has-sos" : ""}`} ref={ref} tabIndex={-1} aria-label={name(cat)}>
      {close}
      <header className="panel-head">
        <span className={`panel-icon u-${inc.urgency}`} aria-hidden="true">
          <CategoryIcon icon={cat?.icon ?? "circle-help"} size={22} />
        </span>
        <div>
          <h2>{name(cat)}</h2>
          <p className="muted inline-icon">
            <MapPin size={14} aria-hidden="true" /> {[inc.addressText, name(lookup.area(inc.areaId))].filter(Boolean).join(", ")}
          </p>
        </div>
      </header>
      <div className="badge-row">
        <UrgencyBadge urgency={inc.urgency} />
        <VerificationBadge incident={inc} />
        <StatusPill status={inc.status} />
      </div>

      {inc.sos ? <SosSection incident={inc} /> : null}
      <VoteBox incident={inc} />
      <StatusTracker incident={inc} />

      <p className="description">{inc.description}</p>
      {inc.media.length ? (
        <div className="photos">
          {inc.media.map((m) => (
            <a key={m.id} href={m.url} target="_blank" rel="noreferrer">
              <img src={m.url} alt="" loading="lazy" />
            </a>
          ))}
        </div>
      ) : null}

      <dl className="facts">
        <div>
          <dt>{t("incident.factHappened")}</dt>
          <dd>{dateTime(inc.occurredAt, lang)}</dd>
        </div>
        <div>
          <dt>{t("incident.factReporter")}</dt>
          <dd>
            {identityLabel({ isYou: inc.reporterIsYou, isAnonymous: inc.isAnonymous, name: inc.reporter?.displayName ?? null }, t)}
            {inc.isAnonymous && inc.reporter && !inc.reporterIsYou ? <AnonymousBadge label={t("incident.anonymousToPublic")} /> : null}
          </dd>
        </div>
        <div>
          <dt>{t("incident.factAuthority")}</dt>
          <dd>{authority ? t("incident.assigned", { authority: name(authority) }) : cat?.authorityType ? t("incident.awaitingAssignment") : t("incident.communityOnly")}</dd>
        </div>
      </dl>

      <Timeline incident={inc} />
      <Thread incident={inc} />

      <footer className="panel-foot">
        <button className="btn btn-ghost btn-sm" onClick={() => void copyLink(inc.id)}>
          <Link2 size={15} aria-hidden="true" />
          {t("incident.share")}
        </button>
        <FlagButton incidentId={inc.id} />
      </footer>
    </aside>
  );
}
