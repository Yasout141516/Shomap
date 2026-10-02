import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import maplibregl, { type Map as MlMap } from "maplibre-gl";
import { Camera, Crosshair, Phone, Siren, X } from "lucide-react";
import { URGENCIES, type CategoryDTO, type IncidentDTO, type Urgency } from "@shomap/shared";
import { useI18n } from "../../i18n";
import { ApiFail, api, errorText } from "../../lib/api";
import { useApp } from "../../lib/appState";
import { fromLocalInput, toLocalInput } from "../../lib/format";
import { inBounds, nearest } from "../../lib/geo";
import { qk, useMeta } from "../../lib/queries";
import { useHomeAreaId, useSession } from "../../lib/session";
import { Modal } from "../../ui/Modal";
import { CategoryIcon } from "../../ui/icons";
import { shapeSvg } from "../../ui/pin";
import { StatusTracker } from "../../ui/StatusTracker";
import { BaseMap } from "../map/BaseMap";
import { LangToggle } from "../shell/LangToggle";

const MAX_PHOTOS = 3;
const MAX_BYTES = 5 * 1024 * 1024;

/** crypto.randomUUID needs a secure context, which phones on plain LAN http don't have. */
function newKey(): string {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

interface Photo {
  file: File;
  url: string;
  error: string | null;
}

function CategoryStep({ onPick }: { onPick: (c: CategoryDTO) => void }) {
  const { t, name } = useI18n();
  const meta = useMeta();
  const cats = meta.data?.categories ?? [];
  return (
    <div className="report-step">
      <h3>{t("report.everyday")}</h3>
      <div className="cat-grid">
        {cats
          .filter((c) => !c.isBlocked)
          .map((c) => (
            <button key={c.id} className={`cat-btn${c.triggersSos ? " cat-sos" : ""}`} onClick={() => onPick(c)}>
              <CategoryIcon icon={c.icon} size={22} />
              <span>{name(c)}</span>
            </button>
          ))}
      </div>
      <h3 className="serious-title">{t("report.seriousTitle")}</h3>
      <p className="muted small">{t("report.seriousBody")}</p>
      <div className="cat-grid cat-grid-serious">
        {cats
          .filter((c) => c.isBlocked)
          .map((c) => (
            <button key={c.id} className="cat-btn cat-blocked" onClick={() => onPick(c)}>
              <CategoryIcon icon={c.icon} size={22} />
              <span>{name(c)}</span>
            </button>
          ))}
      </div>
    </div>
  );
}

function HotlineCard({ category, onBack }: { category: CategoryDTO; onBack: () => void }) {
  const { t } = useI18n();
  const hotline = category.redirectHotline ?? "999";
  return (
    <div className="hotline" role="alert">
      <Siren size={36} aria-hidden="true" />
      <h3>{t("report.blockedTitle", { hotline })}</h3>
      <p>{t("report.blockedBody")}</p>
      <p className="hotline-number" aria-label={t("report.blockedNumber")}>
        {hotline}
      </p>
      <a className="btn btn-sos btn-block" href={`tel:${hotline}`}>
        <Phone size={18} aria-hidden="true" />
        {t("report.call", { hotline })}
      </a>
      <button className="btn btn-ghost btn-block" onClick={onBack}>
        {t("report.chooseOther")}
      </button>
    </div>
  );
}

function LocationStep({
  point,
  setPoint,
}: {
  point: { lat: number; lng: number };
  setPoint: (p: { lat: number; lng: number }) => void;
}) {
  const { t, name } = useI18n();
  const meta = useMeta();
  const [gpsMsg, setGpsMsg] = useState<string | null>(window.isSecureContext && navigator.geolocation ? null : t("report.gpsUnavailable"));
  const [locating, setLocating] = useState(false);
  const mapRef = useRef<MlMap | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);
  const bounds = meta.data?.config.dhakaBounds;
  const outside = bounds ? !inBounds(point, bounds) : false;
  const area = meta.data ? nearest(point, meta.data.areas) : undefined;

  const move = (p: { lat: number; lng: number }, fly = true) => {
    setPoint(p);
    marker.current?.setLngLat([p.lng, p.lat]);
    if (fly) mapRef.current?.flyTo({ center: [p.lng, p.lat], zoom: 15 });
  };

  const ready = (map: MlMap) => {
    mapRef.current = map;
    const m = new maplibregl.Marker({ draggable: true, color: "#006A4E" }).setLngLat([point.lng, point.lat]).addTo(map);
    m.on("dragend", () => {
      const ll = m.getLngLat();
      setPoint({ lat: ll.lat, lng: ll.lng });
    });
    map.on("click", (e) => move({ lat: e.lngLat.lat, lng: e.lngLat.lng }, false));
    marker.current = m;
    if (bounds) {
      const [w, s, e, n] = bounds;
      map.addSource("dhaka-bounds", {
        type: "geojson",
        data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[w, s], [e, s], [e, n], [w, n], [w, s]] } },
      });
      map.addLayer({ id: "dhaka-bounds", type: "line", source: "dhaka-bounds", paint: { "line-color": "#006A4E", "line-width": 2, "line-dasharray": [3, 2] } });
    }
  };

  const locate = () => {
    if (!navigator.geolocation || !window.isSecureContext) {
      setGpsMsg(t("report.gpsUnavailable"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setGpsMsg(null);
        move({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setLocating(false);
        setGpsMsg(t("report.gpsDenied"));
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  return (
    <div className="report-step">
      <p className="muted">{t("report.locationHelp")}</p>
      <div className="row-gap wrap">
        <button type="button" className="btn btn-secondary btn-sm" onClick={locate} disabled={locating}>
          <Crosshair size={16} aria-hidden="true" />
          {locating ? t("report.locating") : t("report.useMyLocation")}
        </button>
        <label className="sr-only" htmlFor="jump-area">
          {t("report.jumpToArea")}
        </label>
        <select
          id="jump-area"
          value=""
          onChange={(e) => {
            const a = meta.data?.areas.find((x) => x.id === e.target.value);
            if (a) move({ lat: a.lat, lng: a.lng });
          }}
        >
          <option value="">{t("report.jumpToArea")}…</option>
          {meta.data?.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {name(a)}
            </option>
          ))}
        </select>
      </div>
      {gpsMsg ? <p className="note">{gpsMsg}</p> : null}
      <BaseMap center={point} zoom={15} onReady={ready} className="report-map" ariaLabel={t("report.step2")} />
      {outside ? (
        <p className="field-error" role="alert">
          {t("report.outOfArea")}
        </p>
      ) : area ? (
        <p className="muted small">{t("report.nearArea", { area: name(area) })}</p>
      ) : null}
    </div>
  );
}

export function ReportModal() {
  const { t, name } = useI18n();
  const { closeReport, toast } = useApp();
  const meta = useMeta();
  const { me } = useSession();
  const homeAreaId = useHomeAreaId();
  const nav = useNavigate();
  const qc = useQueryClient();

  const key = useMemo(newKey, []);
  const home = meta.data?.areas.find((a) => a.id === homeAreaId) ?? meta.data?.areas.find((a) => a.id === "farmgate");
  const [step, setStep] = useState<1 | 2 | 3 | "done">(1);
  const [category, setCategory] = useState<CategoryDTO | null>(null);
  const [point, setPoint] = useState(home ? { lat: home.lat, lng: home.lng } : { lat: 23.7575, lng: 90.3897 });
  const [description, setDescription] = useState("");
  const [landmark, setLandmark] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [when, setWhen] = useState(toLocalInput(new Date()));
  const [urgency, setUrgency] = useState<Urgency>("medium");
  const [anonymous, setAnonymous] = useState(false);
  const [child, setChild] = useState({ name: "", age: "", clothing: "", lastSeen: toLocalInput(new Date()) });
  const [phase, setPhase] = useState<"idle" | "sending" | "retrying" | "failed">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ incident: IncidentDTO; neighboursAsked: number } | null>(null);

  // Revoke preview URLs only when the modal closes; removing a photo revokes its own.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  if (!me || me.role !== "citizen") {
    return (
      <Modal title={t("report.title")} onClose={closeReport}>
        <p>{me ? t("report.staffCantReport") : t("report.loginFirst")}</p>
        {!me ? (
          <Link className="btn btn-primary" to="/login" onClick={closeReport}>
            {t("common.login")}
          </Link>
        ) : null}
      </Modal>
    );
  }

  const pick = (c: CategoryDTO) => {
    setCategory(c);
    setUrgency(c.defaultUrgency === "critical" ? "critical" : c.defaultUrgency);
    setAnonymous(c.anonymousDefault);
    if (!c.isBlocked) setStep(2);
  };

  const isSos = !!category?.triggersSos;
  const bounds = meta.data?.config.dhakaBounds;
  const outside = bounds ? !inBounds(point, bounds) : false;
  const urgencyChoices = (() => {
    if (!category || isSos) return [];
    const d = URGENCIES.indexOf(category.defaultUrgency);
    return URGENCIES.filter((_, i) => Math.abs(i - d) <= 1 && i < 3);
  })();

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const next = [...photos];
    for (const f of Array.from(files)) {
      if (next.length >= MAX_PHOTOS) break;
      const err = !f.type.startsWith("image/") ? t("report.photoType") : f.size > MAX_BYTES ? t("report.photoTooLarge") : null;
      next.push({ file: f, url: URL.createObjectURL(f), error: err });
    }
    setPhotos(next);
  };
  const okPhotos = photos.filter((p) => !p.error);

  const descOk = description.trim().length >= 10;
  const sosOk = !isSos || (child.name.trim() && child.age !== "" && child.clothing.trim().length >= 3 && okPhotos.length > 0);
  const canSubmit = descOk && sosOk && !outside && phase !== "sending" && phase !== "retrying";

  const submit = async () => {
    if (!category) return;
    setError(null);
    const data = {
      categoryId: category.id,
      lat: point.lat,
      lng: point.lng,
      description: description.trim(),
      urgency: isSos ? undefined : urgency,
      occurredAt: fromLocalInput(when),
      isAnonymous: isSos ? false : anonymous,
      addressText: landmark.trim() || undefined,
      idempotencyKey: key,
      sos: isSos ? { childName: child.name.trim(), childAge: Number(child.age), clothing: child.clothing.trim(), lastSeenAt: fromLocalInput(child.lastSeen) } : undefined,
    };
    const form = () => {
      const fd = new FormData();
      fd.append("data", JSON.stringify(data));
      okPhotos.forEach((p) => fd.append("photos", p.file, p.file.name));
      return fd;
    };
    // Network failures retry with backoff using the same idempotency key, so nothing is sent twice.
    for (let attempt = 0; attempt < 3; attempt++) {
      setPhase(attempt === 0 ? "sending" : "retrying");
      try {
        const r = await api<{ incident: IncidentDTO; neighboursAsked: number }>("/api/incidents", { form: form() });
        setResult(r);
        setPhase("idle");
        setStep("done");
        void qc.invalidateQueries({ queryKey: qk.incidents });
        return;
      } catch (e) {
        if (e instanceof ApiFail && e.code === "network" && attempt < 2) {
          await new Promise((res) => setTimeout(res, 800 * (attempt + 1)));
          continue;
        }
        setPhase("failed");
        setError(e instanceof ApiFail && e.code === "network" ? t("report.failed") : errorText(e, t));
        if (e instanceof ApiFail && e.code === "out_of_area") setStep(2);
        return;
      }
    }
  };

  const stepTitle = step === 1 ? t("report.step1") : step === 2 ? t("report.step2") : step === 3 ? t("report.step3") : t("report.successTitle");
  const areaName = name(meta.data ? nearest(point, meta.data.areas) : undefined);

  let footer = null;
  if (step === 2)
    footer = (
      <>
        <button className="btn btn-ghost" onClick={() => setStep(1)}>
          {t("common.back")}
        </button>
        <button className="btn btn-primary" disabled={outside} onClick={() => setStep(3)}>
          {t("common.next")}
        </button>
      </>
    );
  if (step === 3)
    footer = (
      <>
        <button className="btn btn-ghost" onClick={() => setStep(2)}>
          {t("common.back")}
        </button>
        <button className={`btn ${isSos ? "btn-sos" : "btn-primary"}`} disabled={!canSubmit} onClick={() => void submit()}>
          {phase === "sending" ? t("report.sending") : phase === "retrying" ? t("report.retrying") : isSos ? t("report.submitSos") : t("report.submit")}
        </button>
      </>
    );

  return (
    <Modal title={step === "done" ? stepTitle : `${t("report.title")} · ${stepTitle}`} onClose={closeReport} footer={footer} wide={step === 2}>
      <div className="step-of">
        <span aria-live="polite">{typeof step === "number" ? t("report.stepOf", { n: step }) : null}</span>
        <LangToggle />
      </div>

      {step === 1 ? category?.isBlocked ? <HotlineCard category={category} onBack={() => setCategory(null)} /> : <CategoryStep onPick={pick} /> : null}

      {step === 2 ? <LocationStep point={point} setPoint={setPoint} /> : null}

      {step === 3 && category ? (
        <form className="report-step form" onSubmit={(e) => e.preventDefault()}>
          <p className="picked">
            <CategoryIcon icon={category.icon} size={18} /> {name(category)} · {areaName}
          </p>

          {isSos ? (
            <>
              <p className="note note-sos">{t("report.sosNotice")}</p>
              <div className="grid-2">
                <label className="field">
                  <span className="field-label">{t("report.childName")}</span>
                  <input id="child-name" value={child.name} maxLength={40} onChange={(e) => setChild({ ...child, name: e.target.value })} />
                </label>
                <label className="field">
                  <span className="field-label">{t("report.childAge")}</span>
                  <input id="child-age" type="number" min={0} max={17} value={child.age} onChange={(e) => setChild({ ...child, age: e.target.value })} />
                </label>
              </div>
              <label className="field">
                <span className="field-label">{t("report.clothing")}</span>
                <input id="child-clothing" value={child.clothing} placeholder={t("report.clothingPlaceholder")} maxLength={200} onChange={(e) => setChild({ ...child, clothing: e.target.value })} />
              </label>
              <label className="field">
                <span className="field-label">{t("report.lastSeen")}</span>
                <input id="child-last-seen" type="datetime-local" value={child.lastSeen} onChange={(e) => setChild({ ...child, lastSeen: e.target.value })} />
              </label>
            </>
          ) : null}

          <label className="field">
            <span className="field-label">{t("report.description")}</span>
            <textarea id="report-description" value={description} rows={3} maxLength={280} onChange={(e) => setDescription(e.target.value)} aria-describedby="desc-help" />
            <span id="desc-help" className="field-help">
              {t("report.descriptionHelp")} <span className="tabular">{t("report.descriptionCount", { n: description.length })}</span>
            </span>
          </label>

          <label className="field">
            <span className="field-label">
              {t("report.landmark")} <span className="muted">({t("common.optional")})</span>
            </span>
            <input id="report-landmark" value={landmark} maxLength={120} placeholder={t("report.landmarkPlaceholder")} onChange={(e) => setLandmark(e.target.value)} />
          </label>

          <div className="field">
            <span className="field-label">{isSos ? t("report.childPhoto") : `${t("report.photos")} (${t("common.optional")})`}</span>
            <span className="field-help">{isSos ? t("report.childPhotoHelp") : t("report.photosHelp")}</span>
            <div className="photo-row">
              {photos.map((p, i) => (
                <div key={p.url} className={`photo-thumb${p.error ? " has-error" : ""}`}>
                  <img src={p.url} alt="" />
                  {p.error ? <span className="photo-error">{p.error}</span> : null}
                  <button
                    type="button"
                    className="icon-btn photo-remove"
                    aria-label={t("report.removePhoto")}
                    onClick={() => {
                      URL.revokeObjectURL(p.url);
                      setPhotos(photos.filter((_, j) => j !== i));
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <label className="photo-add">
                  <Camera size={20} aria-hidden="true" />
                  <span>{t("report.addPhoto")}</span>
                  <input id="report-photos" type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} />
                </label>
              ) : null}
            </div>
          </div>

          <label className="field">
            <span className="field-label">{t("report.when")}</span>
            <input id="report-when" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </label>

          {!isSos ? (
            <div className="field">
              <span className="field-label">{t("report.urgency")}</span>
              <div className="seg" role="group" aria-label={t("report.urgency")}>
                {urgencyChoices.map((u) => (
                  <button type="button" key={u} className={urgency === u ? "on" : ""} aria-pressed={urgency === u} onClick={() => setUrgency(u)}>
                    <span dangerouslySetInnerHTML={{ __html: shapeSvg(u, 12) }} /> {t(`urgency.${u}`)}
                  </button>
                ))}
              </div>
              <span className="field-help">{t("report.urgencyHelp", { level: t(`urgency.${category.defaultUrgency}`) })}</span>
            </div>
          ) : null}

          {isSos ? (
            <p className="note">{t("report.sosNoAnon")}</p>
          ) : (
            <label className="toggle-field">
              <input id="report-anonymous" type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} />
              <span>
                <strong>{t("report.anonymous")}</strong>
                <span className="field-help">{t("report.anonymousHelp")}</span>
              </span>
            </label>
          )}

          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      ) : null}

      {step === "done" && result ? (
        <div className="report-done">
          <StatusTracker incident={result.incident} />
          <p>
            {result.incident.sos
              ? t("report.successSos")
              : result.neighboursAsked > 0
                ? t("report.successBody", { count: result.neighboursAsked, area: areaName })
                : t("report.successBodyNone", { area: areaName })}
          </p>
          <div className="row-gap">
            <button
              className="btn btn-primary"
              onClick={() => {
                closeReport();
                nav(`/incident/${result.incident.id}`);
              }}
            >
              {t("report.viewReport")}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                closeReport();
                toast(t("report.successTitle"), "success");
                nav("/");
              }}
            >
              {t("report.done")}
            </button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
