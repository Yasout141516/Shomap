import { useState } from "react";
import { useI18n } from "../../i18n";
import { useMeta } from "../../lib/queries";
import { guestArea, setGuestArea, useSession } from "../../lib/session";
import { useApp } from "../../lib/appState";

/** PRD §12.4 first run: language + home area, nothing else required before browsing. */
export function FirstRun() {
  const { t, lang, setLang, name } = useI18n();
  const meta = useMeta();
  const { me, loading, updateMe } = useSession();
  const { focusMap } = useApp();
  const [dismissed, setDismissed] = useState(false);
  const [area, setArea] = useState("farmgate");

  const needed = !loading && !dismissed && (me ? me.role === "citizen" && !me.homeAreaId : !guestArea());
  if (!needed || !meta.data) return null;

  const go = async () => {
    setGuestArea(area);
    if (me) await updateMe({ homeAreaId: area }).catch(() => undefined);
    const a = meta.data!.areas.find((x) => x.id === area);
    if (a) focusMap(a.lat, a.lng, 14);
    setDismissed(true);
  };

  return (
    <div className="firstrun" role="dialog" aria-modal="false" aria-labelledby="firstrun-title">
      <h2 id="firstrun-title">{t("firstRun.title")}</h2>
      <p className="muted">{t("firstRun.body")}</p>
      <div className="field">
        <span className="field-label">{t("common.language")}</span>
        <div className="seg" role="group">
          <button className={lang === "en" ? "on" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")} lang="en">
            English
          </button>
          <button className={lang === "bn" ? "on" : ""} aria-pressed={lang === "bn"} onClick={() => setLang("bn")} lang="bn">
            বাংলা
          </button>
        </div>
      </div>
      <label className="field">
        <span className="field-label">{t("firstRun.area")}</span>
        <select id="firstrun-area" value={area} onChange={(e) => setArea(e.target.value)}>
          {meta.data.areas.map((a) => (
            <option key={a.id} value={a.id}>
              {name(a)}
            </option>
          ))}
        </select>
      </label>
      <button className="btn btn-primary btn-block" onClick={() => void go()}>
        {t("firstRun.go")}
      </button>
    </div>
  );
}
