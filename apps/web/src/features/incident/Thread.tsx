import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import { MapPin, Reply, ShieldCheck } from "lucide-react";
import type { CommentDTO, IncidentDetailDTO } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { api, errorText } from "../../lib/api";
import { useApp } from "../../lib/appState";
import { relTime } from "../../lib/format";
import { qk, useComments, useMeta } from "../../lib/queries";
import { useSession } from "../../lib/session";
import { EmptyState, ErrorState, Skeleton } from "../../ui/states";
import { BaseMap } from "../map/BaseMap";

type Kind = "comment" | "update" | "offer_help" | "sighting";

function CommentItem({ c, onReply }: { c: CommentDTO; onReply?: () => void }) {
  const { t, name, lang } = useI18n();
  const meta = useMeta();
  const authority = c.authorityId ? meta.data?.authorities.find((a) => a.id === c.authorityId) : undefined;
  const who =
    c.kind === "official"
      ? authority
        ? name(authority)
        : t("common.moderators")
      : c.authorIsYou
        ? c.isAnonymous
          ? t("common.youHidden")
          : t("common.you")
        : c.author?.displayName ?? t("common.anonymous");
  return (
    <div className={`comment kind-${c.kind}`}>
      <p className="comment-head">
        {c.kind === "official" ? <ShieldCheck size={14} aria-hidden="true" /> : null}
        <strong>{who}</strong>
        {c.kind !== "comment" ? <span className={`badge badge-kind k-${c.kind}`}>{t(`commentKind.${c.kind}`)}</span> : null}
        <span className="muted small">{relTime(c.createdAt, lang)}</span>
      </p>
      <p className="comment-body">{c.body}</p>
      {c.lat !== null && c.lng !== null ? (
        <p className="muted small inline-icon">
          <MapPin size={13} aria-hidden="true" /> {c.lat.toFixed(4)}, {c.lng.toFixed(4)}
        </p>
      ) : null}
      {onReply ? (
        <button className="link-like small inline-icon" onClick={onReply}>
          <Reply size={13} aria-hidden="true" /> {t("incident.reply")}
        </button>
      ) : null}
    </div>
  );
}

function SightingPicker({ center, value, onChange }: { center: { lat: number; lng: number }; value: { lat: number; lng: number } | null; onChange: (p: { lat: number; lng: number }) => void }) {
  const { t } = useI18n();
  const marker = useRef<maplibregl.Marker | null>(null);
  const ready = (map: MlMap) => {
    map.on("click", (e) => {
      const p = { lat: e.lngLat.lat, lng: e.lngLat.lng };
      onChange(p);
      marker.current ??= new maplibregl.Marker({ color: "#F42A41" }).setLngLat(e.lngLat).addTo(map);
      marker.current.setLngLat(e.lngLat);
    });
  };
  return (
    <div className="sighting-picker">
      <BaseMap center={center} zoom={14} onReady={ready} className="mini-map" ariaLabel={t("sos.sightingPin")} />
      <p className="muted small">{value ? t("sos.sightingPinSet") : t("zones.tapMap")}</p>
    </div>
  );
}

export function Thread({ incident }: { incident: IncidentDetailDTO }) {
  const { t } = useI18n();
  const { me } = useSession();
  const { toast } = useApp();
  const qc = useQueryClient();
  const comments = useComments(incident.id);
  const isSos = !!incident.sos;
  const sosActive = incident.sos?.state === "active";
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<Kind>(sosActive ? "sighting" : "comment");
  const [anon, setAnon] = useState(false);
  const [replyTo, setReplyTo] = useState<CommentDTO | null>(null);
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { roots, replies } = useMemo(() => {
    const all = comments.data ?? [];
    const r = new Map<string, CommentDTO[]>();
    for (const c of all) if (c.parentId) r.set(c.parentId, [...(r.get(c.parentId) ?? []), c]);
    return { roots: all.filter((c) => !c.parentId), replies: r };
  }, [comments.data]);

  const isCitizen = me?.role === "citizen";
  const canPost = !!me && incident.status !== "removed";

  const submit = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api(`/api/incidents/${incident.id}/comments`, {
        body: { body, kind: isCitizen ? kind : "comment", parentId: replyTo?.id, isAnonymous: isCitizen && anon && kind !== "sighting", ...(pin && kind === "sighting" ? pin : {}) },
      });
      setBody("");
      setReplyTo(null);
      setPin(null);
      setShowPin(false);
      if (kind === "sighting") toast(t("sos.sightingSent"), "success");
      void qc.invalidateQueries({ queryKey: qk.comments(incident.id) });
    } catch (e) {
      toast(errorText(e, t), "error");
    } finally {
      setBusy(false);
    }
  };

  const kinds: Kind[] = isSos ? ["sighting", "comment", "offer_help"] : ["comment", "update", "offer_help"];

  return (
    <section className="thread" aria-label={t("incident.thread")}>
      <h3>{t("incident.thread")}</h3>
      {comments.isLoading ? (
        <Skeleton rows={2} height={56} />
      ) : comments.isError ? (
        <ErrorState message={t("errors.internal")} onRetry={() => void comments.refetch()} />
      ) : roots.length === 0 ? (
        <EmptyState title={t("incident.noComments")} />
      ) : (
        <ul className="comments">
          {roots.map((c) => (
            <li key={c.id}>
              <CommentItem
                c={c}
                onReply={
                  canPost
                    ? () => {
                        setReplyTo(c);
                        inputRef.current?.focus();
                      }
                    : undefined
                }
              />
              {replies.get(c.id)?.length ? (
                <ul className="replies">
                  {replies.get(c.id)!.map((r) => (
                    <li key={r.id}>
                      <CommentItem c={r} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canPost ? (
        <form
          className="composer"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {replyTo ? (
            <p className="muted small">
              {t("incident.replyingTo")}: “{replyTo.body.slice(0, 50)}”{" "}
              <button type="button" className="link-like" onClick={() => setReplyTo(null)}>
                {t("common.cancel")}
              </button>
            </p>
          ) : null}
          {isCitizen ? (
            <div className="chips" role="group" aria-label={t("incident.thread")}>
              {kinds.map((k) => (
                <button type="button" key={k} className={`chip${kind === k ? " on" : ""}`} aria-pressed={kind === k} onClick={() => setKind(k)}>
                  {k === "sighting" ? t("sos.iSaw") : t(`commentKind.${k}`)}
                </button>
              ))}
            </div>
          ) : null}
          <label className="sr-only" htmlFor="comment-body">
            {t("incident.writeComment")}
          </label>
          <textarea
            id="comment-body"
            ref={inputRef}
            value={body}
            maxLength={500}
            rows={2}
            placeholder={kind === "sighting" ? t("sos.sightingPlaceholder") : t("incident.writeComment")}
            onChange={(e) => setBody(e.target.value)}
          />
          {kind === "sighting" && isCitizen ? (
            showPin ? (
              <SightingPicker center={incident} value={pin} onChange={setPin} />
            ) : (
              <button type="button" className="link-like small inline-icon" onClick={() => setShowPin(true)}>
                <MapPin size={13} aria-hidden="true" /> {t("sos.sightingPin")}
              </button>
            )
          ) : null}
          <div className="composer-foot">
            {isCitizen && kind !== "sighting" ? (
              <label className="check">
                <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
                {t("incident.postAnon")}
              </label>
            ) : (
              <span />
            )}
            <button className="btn btn-primary btn-sm" disabled={busy || !body.trim()}>
              {t("common.send")}
            </button>
          </div>
        </form>
      ) : !me ? (
        <Link to="/login" className="btn btn-secondary btn-sm">
          {t("common.login")}
        </Link>
      ) : null}
    </section>
  );
}
